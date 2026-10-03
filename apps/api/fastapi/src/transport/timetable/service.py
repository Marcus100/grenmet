"""Versioned timetable: reference registry, drafts, validation and publishing.

Routes, shifts, stops and service calendars are a stable registry edited in
place. Trips and stop times belong to a timetable version: a single draft is
edited, validated and published with an effective date. The version in force is
the published one with the latest effective date on or before today (Grenada);
if several share that date, the most recently published wins.
"""

import logging
from collections import defaultdict
from datetime import date, datetime
from zoneinfo import ZoneInfo

from sqlalchemy import delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import has_permission, require_permission
from src.exceptions import AppValidationError, NotFoundError
from src.transport.exceptions import TransportConflict
from src.transport.models import (
    Route,
    ServiceCalendar,
    Shift,
    Stop,
    TimetableStopTime,
    TimetableTrip,
    TimetableVersion,
    TimetableVersionStatus,
    TransportTripStatus,
)

from . import schemas

logger = logging.getLogger(__name__)

GRENADA = ZoneInfo("America/Grenada")
WEEKDAYS = tuple(schemas.TransportWeekday)


def today() -> date:
    return datetime.now(GRENADA).date()


def to_seconds(value: str) -> int:
    hours, minutes = value.split(":")
    return int(hours) * 3600 + int(minutes) * 60


def to_hhmm(seconds: int | None) -> str | None:
    if seconds is None:
        return None
    return f"{seconds // 3600:02d}:{seconds % 3600 // 60:02d}"


# --- Access -----------------------------------------------------------------


def access(user: User) -> schemas.TransportAccess:
    return schemas.TransportAccess(
        canView=has_permission(current_user=user, permission_key="transport.view"),
        canManageTimetable=has_permission(
            current_user=user, permission_key="transport.timetable.manage"
        ),
        canPublishTimetable=has_permission(
            current_user=user, permission_key="transport.timetable.publish"
        ),
    )


def _require_view(user: User) -> None:
    require_permission(current_user=user, permission_key="transport.view")


def _require_manage(user: User) -> None:
    require_permission(current_user=user, permission_key="transport.timetable.manage")


# --- Reference registry -----------------------------------------------------


async def current_version_id(session: AsyncSession) -> int | None:
    version_id: int | None = await session.scalar(
        select(TimetableVersion.id)
        .where(
            TimetableVersion.status == TimetableVersionStatus.PUBLISHED,
            TimetableVersion.effective_date <= today(),
        )
        .order_by(
            TimetableVersion.effective_date.desc(),
            TimetableVersion.published_at.desc(),
        )
        .limit(1)
    )
    return version_id


async def _stops(session: AsyncSession) -> list[schemas.TransportStop]:
    current = await current_version_id(session)
    served: dict[int, list[int]] = defaultdict(list)
    if current is not None:
        rows = await session.execute(
            select(TimetableStopTime.stop_id, Route.number)
            .distinct()
            .join(TimetableTrip, TimetableTrip.id == TimetableStopTime.trip_id)
            .join(Route, Route.id == TimetableTrip.route_id)
            .where(TimetableTrip.version_id == current)
            .order_by(Route.number)
        )
        for stop_id, number in rows.tuples():
            served[stop_id].append(number)
    stops = await session.scalars(select(Stop).order_by(Stop.sort_order, Stop.name))
    return [
        schemas.TransportStop(
            id=stop.id,
            code=stop.code,
            name=stop.name,
            landmark=stop.landmark,
            latitude=float(stop.latitude) if stop.latitude is not None else None,
            longitude=float(stop.longitude) if stop.longitude is not None else None,
            active=stop.active,
            routeNumbers=served.get(stop.id, []),
        )
        for stop in stops
    ]


def _route(route: Route) -> schemas.TransportRoute:
    return schemas.TransportRoute(
        id=route.id,
        number=route.number,
        name=route.name,
        description=route.description,
        active=route.active,
    )


async def catalogue(session: AsyncSession) -> schemas.TransportCatalogue:
    """Reference data every signed-in user (and the staff/driver apps) may read."""
    routes = await session.scalars(
        select(Route).order_by(Route.sort_order, Route.number)
    )
    shifts = await session.scalars(select(Shift).order_by(Shift.sort_order))
    calendars = await session.scalars(
        select(ServiceCalendar).order_by(ServiceCalendar.sort_order)
    )
    return schemas.TransportCatalogue(
        routes=[_route(route) for route in routes],
        shifts=[
            schemas.TransportShift(
                id=shift.id,
                slug=shift.slug,
                name=shift.name,
                startTime=shift.start_time.strftime("%H:%M"),
                endTime=shift.end_time.strftime("%H:%M"),
            )
            for shift in shifts
        ],
        stops=await _stops(session),
        calendars=[
            schemas.ServiceCalendarView(
                id=calendar.id,
                slug=calendar.slug,
                name=calendar.name,
                days=[day for day in WEEKDAYS if getattr(calendar, day.value)],
                runsOnPublicHolidays=calendar.runs_on_public_holidays,
            )
            for calendar in calendars
        ],
    )


async def _commit(session: AsyncSession, conflict: str) -> None:
    try:
        await session.commit()
    except IntegrityError:
        await session.rollback()
        raise TransportConflict(conflict) from None


async def create_route(
    session: AsyncSession, user: User, payload: schemas.TransportRouteInput
) -> schemas.TransportRoute:
    _require_manage(user)
    sort_order = await session.scalar(
        select(func.coalesce(func.max(Route.sort_order), -1))
    )
    route = Route(
        number=payload.number,
        name=payload.name,
        description=payload.description,
        active=payload.active,
        sort_order=(sort_order or 0) + 1,
    )
    session.add(route)
    await _commit(session, f"Route {payload.number} already exists")
    logger.info("Transport route created", extra={"route_id": route.id})
    return _route(route)


async def update_route(
    session: AsyncSession,
    user: User,
    route_id: int,
    payload: schemas.TransportRouteInput,
) -> schemas.TransportRoute:
    _require_manage(user)
    route = await session.get(Route, route_id)
    if route is None:
        raise NotFoundError("Route not found")
    route.number = payload.number
    route.name = payload.name
    route.description = payload.description
    route.active = payload.active
    await _commit(session, f"Route {payload.number} already exists")
    logger.info("Transport route updated", extra={"route_id": route_id})
    return _route(route)


async def _stop(session: AsyncSession, stop_id: int) -> schemas.TransportStop:
    return next(stop for stop in await _stops(session) if stop.id == stop_id)


async def create_stop(
    session: AsyncSession, user: User, payload: schemas.TransportStopInput
) -> schemas.TransportStop:
    _require_manage(user)
    sort_order = await session.scalar(
        select(func.coalesce(func.max(Stop.sort_order), -1))
    )
    stop = Stop(
        slug=payload.code.lower(),
        code=payload.code,
        name=payload.name,
        landmark=payload.landmark,
        latitude=payload.latitude,
        longitude=payload.longitude,
        active=payload.active,
        sort_order=(sort_order or 0) + 1,
    )
    session.add(stop)
    await _commit(session, f"Stop code {payload.code} is already in use")
    logger.info("Transport stop created", extra={"stop_id": stop.id})
    return await _stop(session, stop.id)


async def update_stop(
    session: AsyncSession,
    user: User,
    stop_id: int,
    payload: schemas.TransportStopInput,
) -> schemas.TransportStop:
    _require_manage(user)
    stop = await session.get(Stop, stop_id)
    if stop is None:
        raise NotFoundError("Stop not found")
    stop.code = payload.code
    stop.name = payload.name
    stop.landmark = payload.landmark
    stop.latitude = payload.latitude  # type: ignore[assignment]
    stop.longitude = payload.longitude  # type: ignore[assignment]
    stop.active = payload.active
    await _commit(session, f"Stop code {payload.code} is already in use")
    logger.info("Transport stop updated", extra={"stop_id": stop_id})
    return await _stop(session, stop_id)


# --- Versions ---------------------------------------------------------------


def _state(
    version: TimetableVersion, current_id: int | None, on: date
) -> schemas.TimetableVersionState:
    if version.status == TimetableVersionStatus.DRAFT:
        return schemas.TimetableVersionState.DRAFT
    if version.status == TimetableVersionStatus.DISCARDED:
        return schemas.TimetableVersionState.DISCARDED
    if version.id == current_id:
        return schemas.TimetableVersionState.CURRENT
    if version.effective_date is not None and version.effective_date > on:
        return schemas.TimetableVersionState.SCHEDULED
    return schemas.TimetableVersionState.SUPERSEDED


def _summary(
    version: TimetableVersion, current_id: int | None, trip_count: int
) -> schemas.TimetableVersionSummary:
    return schemas.TimetableVersionSummary(
        id=version.id,
        label=version.label,
        status=version.status,
        state=_state(version, current_id, today()),
        effectiveDate=version.effective_date,
        sourceRef=version.source_ref,
        notes=version.notes,
        basedOnId=version.based_on_id,
        createdAt=version.created_at,
        updatedAt=version.updated_at,
        publishedAt=version.published_at,
        tripCount=trip_count,
    )


async def list_versions(
    session: AsyncSession, user: User
) -> list[schemas.TimetableVersionSummary]:
    _require_view(user)
    current = await current_version_id(session)
    trip_count = (
        select(func.count(TimetableTrip.id))
        .where(TimetableTrip.version_id == TimetableVersion.id)
        .scalar_subquery()
    )
    rows = await session.execute(
        select(TimetableVersion, trip_count).order_by(TimetableVersion.id.desc())
    )
    return [_summary(version, current, count) for version, count in rows.tuples()]


async def _version(session: AsyncSession, version_id: int) -> TimetableVersion:
    version = await session.get(TimetableVersion, version_id)
    if version is None:
        raise NotFoundError("Timetable version not found")
    return version


async def _draft(session: AsyncSession, version_id: int) -> TimetableVersion:
    version = await _version(session, version_id)
    if version.status != TimetableVersionStatus.DRAFT:
        raise TransportConflict("Only a draft timetable can be changed")
    return version


async def _trips(
    session: AsyncSession, version_id: int
) -> list[schemas.TimetableTripView]:
    stop_rows = await session.execute(
        select(
            TimetableStopTime.trip_id,
            TimetableStopTime.stop_sequence,
            TimetableStopTime.stop_id,
            Stop.name,
            TimetableStopTime.departure_seconds,
            TimetableStopTime.timepoint,
        )
        .join(Stop, Stop.id == TimetableStopTime.stop_id)
        .join(TimetableTrip, TimetableTrip.id == TimetableStopTime.trip_id)
        .where(TimetableTrip.version_id == version_id)
        .order_by(TimetableStopTime.trip_id, TimetableStopTime.stop_sequence)
    )
    stops: dict[int, list[schemas.TimetableStopTimeView]] = defaultdict(list)
    for trip_id, sequence, stop_id, name, seconds, timepoint in stop_rows.tuples():
        stops[trip_id].append(
            schemas.TimetableStopTimeView(
                sequence=sequence,
                stopId=stop_id,
                stopName=name,
                time=to_hhmm(seconds),
                timepoint=timepoint,
            )
        )
    trips = await session.scalars(
        select(TimetableTrip)
        .join(Route, Route.id == TimetableTrip.route_id)
        .join(Shift, Shift.id == TimetableTrip.shift_id)
        .where(TimetableTrip.version_id == version_id)
        .order_by(
            Route.sort_order,
            Shift.sort_order,
            TimetableTrip.sort_order,
            TimetableTrip.depart_seconds,
            TimetableTrip.id,
        )
    )
    return [
        schemas.TimetableTripView(
            id=trip.id,
            routeId=trip.route_id,
            shiftId=trip.shift_id,
            calendarId=trip.service_calendar_id,
            direction=trip.direction,
            departTime=to_hhmm(trip.depart_seconds) or "",
            arriveTime=to_hhmm(trip.arrive_seconds),
            status=trip.status,
            notes=trip.notes,
            sourceRef=trip.source_ref,
            stops=stops.get(trip.id, []),
        )
        for trip in trips
    ]


async def _issues(
    session: AsyncSession, trips: list[schemas.TimetableTripView]
) -> list[schemas.TimetableIssue]:
    Severity = schemas.TimetableIssueSeverity
    issues: list[schemas.TimetableIssue] = []
    if not trips:
        issues.append(
            schemas.TimetableIssue(
                severity=Severity.ERROR,
                code="no_trips",
                message="The timetable has no trips",
            )
        )
    inactive_routes = set(await session.scalars(select(Route.id).where(~Route.active)))
    inactive_stops = set(await session.scalars(select(Stop.id).where(~Stop.active)))
    for trip in trips:
        times = [to_seconds(stop.time) for stop in trip.stops if stop.time]
        if any(
            later < earlier for earlier, later in zip(times, times[1:], strict=False)
        ):
            issues.append(
                schemas.TimetableIssue(
                    severity=Severity.ERROR,
                    code="stop_times_out_of_order",
                    message="Stop times go backwards along the trip",
                    tripId=trip.id,
                    routeId=trip.routeId,
                )
            )
        if times and times[0] < to_seconds(trip.departTime):
            issues.append(
                schemas.TimetableIssue(
                    severity=Severity.WARNING,
                    code="stop_before_departure",
                    message="A stop time is earlier than the trip's departure",
                    tripId=trip.id,
                    routeId=trip.routeId,
                )
            )
        if not trip.stops:
            issues.append(
                schemas.TimetableIssue(
                    severity=Severity.WARNING,
                    code="no_stops",
                    message="The trip lists no stops",
                    tripId=trip.id,
                    routeId=trip.routeId,
                )
            )
        if trip.status == TransportTripStatus.AWAITING_CONFIRMATION:
            issues.append(
                schemas.TimetableIssue(
                    severity=Severity.WARNING,
                    code="awaiting_confirmation",
                    message="Times are awaiting confirmation",
                    tripId=trip.id,
                    routeId=trip.routeId,
                )
            )
        if trip.routeId in inactive_routes:
            issues.append(
                schemas.TimetableIssue(
                    severity=Severity.WARNING,
                    code="inactive_route",
                    message="The trip belongs to an inactive route",
                    tripId=trip.id,
                    routeId=trip.routeId,
                )
            )
        if any(stop.stopId in inactive_stops for stop in trip.stops):
            issues.append(
                schemas.TimetableIssue(
                    severity=Severity.WARNING,
                    code="inactive_stop",
                    message="The trip calls at an inactive stop",
                    tripId=trip.id,
                    routeId=trip.routeId,
                )
            )
    used = {stop.stopId for trip in trips for stop in trip.stops}
    unmapped = await session.scalar(
        select(func.count(Stop.id)).where(Stop.id.in_(used), Stop.latitude.is_(None))
    )
    if unmapped:
        issues.append(
            schemas.TimetableIssue(
                severity=Severity.WARNING,
                code="stops_without_location",
                message=f"{unmapped} stops have no map location yet",
            )
        )
    return issues


async def _detail(
    session: AsyncSession, version: TimetableVersion
) -> schemas.TimetableVersionDetail:
    trips = await _trips(session, version.id)
    return schemas.TimetableVersionDetail(
        version=_summary(version, await current_version_id(session), len(trips)),
        trips=trips,
        issues=await _issues(session, trips),
    )


async def version_detail(
    session: AsyncSession, user: User, version_id: int
) -> schemas.TimetableVersionDetail:
    _require_view(user)
    return await _detail(session, await _version(session, version_id))


async def current_timetable(session: AsyncSession) -> schemas.TimetableVersionDetail:
    """The timetable in force today; any signed-in staff member may read it."""
    version_id = await current_version_id(session)
    if version_id is None:
        raise NotFoundError("No timetable is in force yet")
    return await _detail(session, await _version(session, version_id))


async def create_draft(
    session: AsyncSession, user: User, payload: schemas.TimetableVersionCreate
) -> schemas.TimetableVersionDetail:
    """Start the single draft as a copy of the timetable in force (or the latest published)."""
    _require_manage(user)
    base_id = await current_version_id(session) or await session.scalar(
        select(TimetableVersion.id)
        .where(TimetableVersion.status == TimetableVersionStatus.PUBLISHED)
        .order_by(
            TimetableVersion.effective_date.desc(),
            TimetableVersion.published_at.desc(),
        )
        .limit(1)
    )
    draft = TimetableVersion(
        label=payload.label,
        notes=payload.notes,
        source_ref=payload.sourceRef,
        based_on_id=base_id,
        created_by=user.id,
    )
    session.add(draft)
    try:
        await session.flush()
    except IntegrityError:
        await session.rollback()
        raise TransportConflict("A draft timetable already exists") from None
    if base_id is not None:
        await _copy_trips(session, base_id, draft.id)
    await session.commit()
    await session.refresh(draft)
    logger.info(
        "Timetable draft created",
        extra={"version_id": draft.id, "based_on_id": base_id},
    )
    return await _detail(session, draft)


async def _copy_trips(session: AsyncSession, source_id: int, target_id: int) -> None:
    trips = list(
        await session.scalars(
            select(TimetableTrip)
            .where(TimetableTrip.version_id == source_id)
            .order_by(TimetableTrip.id)
        )
    )
    copies = [
        TimetableTrip(
            version_id=target_id,
            route_id=trip.route_id,
            shift_id=trip.shift_id,
            service_calendar_id=trip.service_calendar_id,
            direction=trip.direction,
            depart_seconds=trip.depart_seconds,
            arrive_seconds=trip.arrive_seconds,
            status=trip.status,
            source_ref=trip.source_ref,
            notes=trip.notes,
            sort_order=trip.sort_order,
            legacy_trip_id=trip.legacy_trip_id,
        )
        for trip in trips
    ]
    session.add_all(copies)
    await session.flush()
    new_ids = {trip.id: copy.id for trip, copy in zip(trips, copies, strict=True)}
    stop_times = await session.scalars(
        select(TimetableStopTime).where(TimetableStopTime.trip_id.in_(list(new_ids)))
    )
    session.add_all(
        TimetableStopTime(
            trip_id=new_ids[stop_time.trip_id],
            stop_id=stop_time.stop_id,
            stop_sequence=stop_time.stop_sequence,
            departure_seconds=stop_time.departure_seconds,
            timepoint=stop_time.timepoint,
        )
        for stop_time in stop_times
    )
    await session.flush()


async def update_draft(
    session: AsyncSession,
    user: User,
    version_id: int,
    payload: schemas.TimetableVersionUpdate,
) -> schemas.TimetableVersionDetail:
    _require_manage(user)
    draft = await _draft(session, version_id)
    draft.label = payload.label
    draft.notes = payload.notes
    draft.source_ref = payload.sourceRef
    await session.commit()
    await session.refresh(draft)
    return await _detail(session, draft)


async def discard_draft(
    session: AsyncSession, user: User, version_id: int
) -> schemas.TimetableVersionSummary:
    _require_manage(user)
    draft = await _draft(session, version_id)
    draft.status = TimetableVersionStatus.DISCARDED
    await session.commit()
    await session.refresh(draft)
    logger.info("Timetable draft discarded", extra={"version_id": version_id})
    count = await session.scalar(
        select(func.count(TimetableTrip.id)).where(
            TimetableTrip.version_id == version_id
        )
    )
    return _summary(draft, await current_version_id(session), count or 0)


async def publish_draft(
    session: AsyncSession,
    user: User,
    version_id: int,
    payload: schemas.TimetablePublish,
) -> schemas.TimetableVersionDetail:
    require_permission(current_user=user, permission_key="transport.timetable.publish")
    draft = await _draft(session, version_id)
    if payload.effectiveDate < today():
        raise AppValidationError("The effective date cannot be in the past")
    trips = await _trips(session, version_id)
    errors = [
        issue
        for issue in await _issues(session, trips)
        if issue.severity == schemas.TimetableIssueSeverity.ERROR
    ]
    if errors:
        raise AppValidationError(
            "Fix the timetable before publishing: "
            + "; ".join(sorted({issue.message for issue in errors}))
        )
    draft.status = TimetableVersionStatus.PUBLISHED
    draft.effective_date = payload.effectiveDate
    draft.published_by = user.id
    draft.published_at = func.now()
    await session.commit()
    await session.refresh(draft)
    logger.info(
        "Timetable published",
        extra={"version_id": version_id, "effective_date": str(payload.effectiveDate)},
    )
    return await _detail(session, draft)


# --- Trips in a draft -------------------------------------------------------


async def _check_references(
    session: AsyncSession, payload: schemas.TimetableTripInput
) -> None:
    for model, key, label in (
        (Route, payload.routeId, "Route"),
        (Shift, payload.shiftId, "Shift"),
        (ServiceCalendar, payload.calendarId, "Service calendar"),
    ):
        if await session.get(model, key) is None:
            raise AppValidationError(f"{label} {key} does not exist")
    wanted = {stop.stopId for stop in payload.stops}
    found = set(await session.scalars(select(Stop.id).where(Stop.id.in_(wanted))))
    if missing := wanted - found:
        raise AppValidationError(f"Unknown stops: {sorted(missing)}")
    if payload.arriveTime and to_seconds(payload.arriveTime) < to_seconds(
        payload.departTime
    ):
        raise AppValidationError("Arrival cannot be before departure")


def _apply(trip: TimetableTrip, payload: schemas.TimetableTripInput) -> None:
    trip.route_id = payload.routeId
    trip.shift_id = payload.shiftId
    trip.service_calendar_id = payload.calendarId
    trip.direction = payload.direction
    trip.depart_seconds = to_seconds(payload.departTime)
    trip.arrive_seconds = to_seconds(payload.arriveTime) if payload.arriveTime else None
    trip.status = payload.status
    trip.notes = payload.notes
    trip.source_ref = payload.sourceRef


def _stop_times(
    trip_id: int, payload: schemas.TimetableTripInput
) -> list[TimetableStopTime]:
    return [
        TimetableStopTime(
            trip_id=trip_id,
            stop_id=stop.stopId,
            stop_sequence=sequence,
            departure_seconds=to_seconds(stop.time) if stop.time else None,
            timepoint=stop.timepoint and stop.time is not None,
        )
        for sequence, stop in enumerate(payload.stops, start=1)
    ]


async def _trip_view(
    session: AsyncSession, version_id: int, trip_id: int
) -> schemas.TimetableTripView:
    return next(
        trip for trip in await _trips(session, version_id) if trip.id == trip_id
    )


async def add_trip(
    session: AsyncSession,
    user: User,
    version_id: int,
    payload: schemas.TimetableTripInput,
) -> schemas.TimetableTripView:
    _require_manage(user)
    draft = await _draft(session, version_id)
    await _check_references(session, payload)
    trip = TimetableTrip(version_id=draft.id)
    _apply(trip, payload)
    session.add(trip)
    await session.flush()
    session.add_all(_stop_times(trip.id, payload))
    draft.updated_at = func.now()
    await session.commit()
    logger.info(
        "Timetable trip added", extra={"version_id": version_id, "trip_id": trip.id}
    )
    return await _trip_view(session, version_id, trip.id)


async def _draft_trip(
    session: AsyncSession, version_id: int, trip_id: int
) -> tuple[TimetableVersion, TimetableTrip]:
    draft = await _draft(session, version_id)
    trip = await session.get(TimetableTrip, trip_id)
    if trip is None or trip.version_id != version_id:
        raise NotFoundError("Trip not found in this timetable")
    return draft, trip


async def replace_trip(
    session: AsyncSession,
    user: User,
    version_id: int,
    trip_id: int,
    payload: schemas.TimetableTripInput,
) -> schemas.TimetableTripView:
    _require_manage(user)
    draft, trip = await _draft_trip(session, version_id, trip_id)
    await _check_references(session, payload)
    _apply(trip, payload)
    await session.execute(
        delete(TimetableStopTime).where(TimetableStopTime.trip_id == trip_id)
    )
    session.add_all(_stop_times(trip_id, payload))
    draft.updated_at = func.now()
    await session.commit()
    logger.info(
        "Timetable trip replaced", extra={"version_id": version_id, "trip_id": trip_id}
    )
    return await _trip_view(session, version_id, trip_id)


async def delete_trip(
    session: AsyncSession, user: User, version_id: int, trip_id: int
) -> None:
    _require_manage(user)
    await _draft_trip(session, version_id, trip_id)
    await session.execute(delete(TimetableTrip).where(TimetableTrip.id == trip_id))
    await session.execute(
        update(TimetableVersion)
        .where(TimetableVersion.id == version_id)
        .values(updated_at=func.now())
    )
    await session.commit()
    logger.info(
        "Timetable trip deleted", extra={"version_id": version_id, "trip_id": trip_id}
    )
