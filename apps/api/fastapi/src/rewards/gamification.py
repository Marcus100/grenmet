"""Venues, trails, check-ins, streaks and achievements (PF9).

Service functions ``flush`` and never ``commit``. Guardrails: a check-in is a
real-world visit proven by the venue's rotating signed QR code (one per venue
per Grenada day), never an app-open event; progress, streaks and achievements
are derived from check-in and ledger records in SQL, and nothing here ranks
people, holds value or can be bought.
"""

import logging
import uuid
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import Any

import sqlalchemy as sa
from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from src.auth.models import User
from src.organisations.config import organisations_settings
from src.organisations.exceptions import SecretStorageUnavailableError
from src.utils import secret_box
from src.utils.datetime import utc_now
from src.utils.timezones import GRENADA, utc_to_local

from . import qr, service, sources
from .exceptions import (
    InvalidCheckInCodeError,
    RewardsConflictError,
    RewardsValidationError,
    TrailNotFoundError,
    VenueNotFoundError,
)
from .models import Entry, EntryKind, EntryStatus
from .models_gamification import (
    AchievementAward,
    AchievementDefinition,
    AchievementRule,
    CheckIn,
    Trail,
    TrailStatus,
    TrailStop,
    Venue,
)
from .schemas_gamification import (
    RewardsAchievementCreate,
    RewardsTrailCreate,
    RewardsTrailStopCreate,
    RewardsTrailUpdate,
)

logger = logging.getLogger(__name__)


def _timestamp(moment: datetime) -> float:
    return moment.replace(tzinfo=UTC).timestamp()


def local_today(now: datetime | None = None) -> date:
    return utc_to_local(now or utc_now(), GRENADA).date()


# --- venues and the signed QR ---------------------------------------------------


def _keys() -> list[str]:
    keys = organisations_settings.ORG_SECRET_ENCRYPTION_KEYS
    if not keys:
        raise SecretStorageUnavailableError()
    return keys


def _venue_secret(venue: Venue) -> str:
    try:
        return secret_box.decrypt(venue.secret_encrypted, _keys())
    except secret_box.SecretBoxError:
        logger.error("Venue secret cannot be decrypted", extra={"venue": str(venue.id)})
        raise SecretStorageUnavailableError() from None


async def create_venue(
    session: AsyncSession, *, organisation_id: str, name: str
) -> Venue:
    venue = Venue(
        organisation_id=organisation_id,
        name=name,
        secret_encrypted=secret_box.encrypt(qr.new_secret(), _keys()),
    )
    session.add(venue)
    await session.flush()
    return venue


async def list_venues(session: AsyncSession, *, organisation_id: str) -> list[Venue]:
    return list(
        await session.scalars(
            select(Venue)
            .where(Venue.organisation_id == organisation_id)
            .order_by(Venue.name, Venue.id)
        )
    )


async def get_venue(
    session: AsyncSession, venue_id: uuid.UUID, *, organisation_id: str
) -> Venue:
    venue = await session.get(Venue, venue_id)
    if venue is None or venue.organisation_id != organisation_id:
        raise VenueNotFoundError()
    return venue


def qr_token(venue: Venue, *, now: datetime | None = None) -> str:
    return qr.make_token(_venue_secret(venue), venue.id, _timestamp(now or utc_now()))


# --- trails ---------------------------------------------------------------------


async def _stop_venue_ok(
    session: AsyncSession, venue_id: uuid.UUID | None, organisation_id: str | None
) -> None:
    if venue_id is None:
        return
    venue = await session.get(Venue, venue_id)
    if venue is None or (
        organisation_id is not None and venue.organisation_id != organisation_id
    ):
        raise RewardsValidationError("Venue not found in this organisation")


async def _add_stop(
    session: AsyncSession,
    trail: Trail,
    payload: RewardsTrailStopCreate,
) -> TrailStop:
    await _stop_venue_ok(session, payload.venue_id, trail.organisation_id)
    position = (
        await session.scalar(
            select(func.coalesce(func.max(TrailStop.position), 0)).where(
                TrailStop.trail_id == trail.id
            )
        )
        or 0
    ) + 1
    stop = TrailStop(
        trail_id=trail.id,
        position=position,
        label=payload.label,
        venue_id=payload.venue_id,
        required_check_in=payload.required_check_in,
    )
    session.add(stop)
    await session.flush()
    return stop


async def create_trail(
    session: AsyncSession,
    *,
    organisation_id: str | None,
    payload: RewardsTrailCreate,
) -> Trail:
    trail = Trail(
        organisation_id=organisation_id,
        name=payload.name,
        description=payload.description,
        kind=payload.kind.value,
        starts_on=payload.starts_on,
        ends_on=payload.ends_on,
        status=payload.status.value,
    )
    session.add(trail)
    await session.flush()
    for stop in payload.stops:
        await _add_stop(session, trail, stop)
    return trail


async def add_trail_stop(
    session: AsyncSession, trail: Trail, payload: RewardsTrailStopCreate
) -> TrailStop:
    return await _add_stop(session, trail, payload)


async def get_trail(
    session: AsyncSession, trail_id: uuid.UUID, *, organisation_id: str
) -> Trail:
    trail = await session.get(Trail, trail_id)
    if trail is None or trail.organisation_id != organisation_id:
        raise TrailNotFoundError()
    return trail


async def update_trail(
    session: AsyncSession, trail: Trail, payload: RewardsTrailUpdate
) -> Trail:
    changes = payload.model_dump(exclude_unset=True)
    for field_name, value in changes.items():
        if field_name in {"name", "description", "status"} and value is None:
            continue
        setattr(trail, field_name, getattr(value, "value", value))
    if trail.starts_on and trail.ends_on and trail.starts_on > trail.ends_on:
        raise RewardsValidationError("starts_on must not be after ends_on")
    await session.flush()
    return trail


async def list_trails(
    session: AsyncSession, *, organisation_id: str
) -> list[tuple[Trail, list[TrailStop]]]:
    trails = list(
        await session.scalars(
            select(Trail)
            .where(Trail.organisation_id == organisation_id)
            .order_by(Trail.created_at, Trail.id)
        )
    )
    return [(trail, await trail_stops(session, trail.id)) for trail in trails]


async def trail_stops(session: AsyncSession, trail_id: uuid.UUID) -> list[TrailStop]:
    return list(
        await session.scalars(
            select(TrailStop)
            .where(TrailStop.trail_id == trail_id)
            .order_by(TrailStop.position)
        )
    )


def _stamp_exists(
    user_id: uuid.UUID, stop: type[TrailStop] = TrailStop
) -> sa.ColumnElement[bool]:
    """A check-in by the user at the stop's venue inside the trail's window."""
    return exists().where(
        CheckIn.user_id == user_id,
        CheckIn.venue_id == stop.venue_id,
        or_(Trail.starts_on.is_(None), CheckIn.local_date >= Trail.starts_on),
        or_(Trail.ends_on.is_(None), CheckIn.local_date <= Trail.ends_on),
    )


def _stamped_at(user_id: uuid.UUID) -> sa.ScalarSelect[datetime]:
    return (
        select(func.min(CheckIn.created_at))
        .where(
            CheckIn.user_id == user_id,
            CheckIn.venue_id == TrailStop.venue_id,
            or_(Trail.starts_on.is_(None), CheckIn.local_date >= Trail.starts_on),
            or_(Trail.ends_on.is_(None), CheckIn.local_date <= Trail.ends_on),
        )
        .correlate(TrailStop, Trail)
        .scalar_subquery()
    )


async def passport(
    session: AsyncSession, user_id: uuid.UUID, *, now: datetime | None = None
) -> list[dict[str, Any]]:
    """Active platform trails and any trail the account has a stamp on, with stamps.

    Stamps are derived from check-ins on every read. Ended trails drop off the
    passport unless the account stamped them.
    """
    today = local_today(now)
    stamped_at = _stamped_at(user_id)
    other = aliased(TrailStop)
    has_stamp = (
        exists()
        .where(other.trail_id == Trail.id, _stamp_exists(user_id, other))
        .correlate(Trail)
    )
    rows = (
        await session.execute(
            select(Trail, TrailStop, stamped_at.label("stamped_at"))
            .join(TrailStop, TrailStop.trail_id == Trail.id)
            .where(
                Trail.status == TrailStatus.ACTIVE.value,
                or_(Trail.starts_on.is_(None), Trail.starts_on <= today),
                or_(Trail.ends_on.is_(None), Trail.ends_on >= today, has_stamp),
                or_(Trail.organisation_id.is_(None), has_stamp),
            )
            .order_by(Trail.created_at, Trail.id, TrailStop.position)
        )
    ).all()
    result: dict[uuid.UUID, dict[str, Any]] = {}
    for trail, stop, stamp in rows:
        item = result.setdefault(
            trail.id,
            {
                "id": trail.id,
                "name": trail.name,
                "description": trail.description,
                "kind": trail.kind,
                "organisation_id": trail.organisation_id,
                "starts_on": trail.starts_on,
                "ends_on": trail.ends_on,
                "stops": [],
                "stamped": 0,
                "required": 0,
                "completed": False,
            },
        )
        item["stops"].append(
            {
                "id": stop.id,
                "position": stop.position,
                "label": stop.label,
                "required_check_in": stop.required_check_in,
                "stamped_at": stamp,
            }
        )
        if stop.required_check_in:
            item["required"] += 1
            item["stamped"] += 1 if stamp is not None else 0
    for item in result.values():
        item["completed"] = item["required"] > 0 and item["stamped"] == item["required"]
    return list(result.values())


async def _trail_completed(
    session: AsyncSession, user_id: uuid.UUID, trail_id: uuid.UUID
) -> bool:
    row = (
        await session.execute(
            select(
                func.count(),
                func.count().filter(_stamp_exists(user_id)),
            )
            .select_from(TrailStop)
            .join(Trail, Trail.id == TrailStop.trail_id)
            .where(TrailStop.trail_id == trail_id, TrailStop.required_check_in)
        )
    ).one()
    return bool(row[0] > 0 and row[0] == row[1])


# --- streaks ----------------------------------------------------------------------


@dataclass
class Streak:
    current_days: int = 0
    longest_days: int = 0
    last_check_in: date | None = None
    checked_in_today: bool = False


async def streak(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    now: datetime | None = None,
    organisation_id: str | None = None,
) -> Streak:
    """Consecutive Grenada days with a check-in, computed in SQL (gaps and islands).

    The current streak is the latest run, and counts only if it reaches today or
    yesterday (a day is not lost until it has passed).
    """
    today = local_today(now)
    days = select(CheckIn.local_date.label("d")).where(CheckIn.user_id == user_id)
    if organisation_id is not None:
        days = days.join(Venue, Venue.id == CheckIn.venue_id).where(
            Venue.organisation_id == organisation_id
        )
    days_sq = days.distinct().subquery()
    numbered = select(
        days_sq.c.d.label("d"),
        (
            days_sq.c.d
            - sa.cast(func.row_number().over(order_by=days_sq.c.d), sa.Integer)
        ).label("grp"),
    ).subquery()
    islands = (
        select(
            func.count().label("length"),
            func.max(numbered.c.d).label("last"),
        )
        .group_by(numbered.c.grp)
        .subquery()
    )
    latest = (
        await session.execute(
            select(islands.c.length, islands.c.last)
            .order_by(islands.c.last.desc())
            .limit(1)
        )
    ).first()
    longest = await session.scalar(select(func.max(islands.c.length))) or 0
    if latest is None:
        return Streak()
    length, last = latest
    current = length if last >= today - timedelta(days=1) else 0
    return Streak(
        current_days=current,
        longest_days=int(longest),
        last_check_in=last,
        checked_in_today=last == today,
    )


# --- achievements -----------------------------------------------------------------


async def _validate_rule(
    session: AsyncSession,
    organisation_id: str | None,
    rule: AchievementRule,
    parameters: dict[str, Any],
) -> dict[str, Any]:
    if rule is AchievementRule.ATTENDED_N_EVENTS:
        n = parameters.get("n")
        if not isinstance(n, int) or isinstance(n, bool) or not 1 <= n <= 1000:
            raise RewardsValidationError("attended_n_events needs n between 1 and 1000")
        return {"n": n}
    if rule is AchievementRule.STREAK_DAYS:
        days = parameters.get("days")
        if not isinstance(days, int) or isinstance(days, bool) or not 2 <= days <= 365:
            raise RewardsValidationError("streak_days needs days between 2 and 365")
        return {"days": days}
    try:
        trail_id = uuid.UUID(str(parameters.get("trail_id")))
    except ValueError:
        raise RewardsValidationError(
            "visited_all_stops_of_trail needs a trail_id"
        ) from None
    trail = await session.get(Trail, trail_id)
    if trail is None or trail.organisation_id not in (None, organisation_id):
        raise RewardsValidationError("Trail not found")
    return {"trail_id": str(trail_id)}


async def create_definition(
    session: AsyncSession,
    *,
    organisation_id: str | None,
    payload: RewardsAchievementCreate,
) -> AchievementDefinition:
    parameters = await _validate_rule(
        session, organisation_id, payload.rule_type, payload.parameters
    )
    if await session.scalar(
        select(AchievementDefinition.id).where(AchievementDefinition.key == payload.key)
    ):
        raise RewardsConflictError("That achievement key is already in use")
    definition = AchievementDefinition(
        organisation_id=organisation_id,
        key=payload.key,
        name=payload.name,
        description=payload.description,
        rule_type=payload.rule_type.value,
        parameters=parameters,
    )
    session.add(definition)
    await session.flush()
    return definition


async def list_definitions(
    session: AsyncSession, *, organisation_id: str
) -> list[AchievementDefinition]:
    return list(
        await session.scalars(
            select(AchievementDefinition)
            .where(AchievementDefinition.organisation_id == organisation_id)
            .order_by(AchievementDefinition.key)
        )
    )


async def _rule_met(
    session: AsyncSession,
    user_id: uuid.UUID,
    definition: AchievementDefinition,
    now: datetime | None,
) -> bool:
    parameters = definition.parameters
    rule = definition.rule_type
    if rule == AchievementRule.ATTENDED_N_EVENTS.value:
        conditions = [
            Entry.account_id == user_id,
            Entry.kind == EntryKind.EARN.value,
            Entry.source_type == sources.EVENTS_ADMISSION,
            Entry.status != EntryStatus.REVERSED.value,
        ]
        if definition.organisation_id is not None:
            conditions.append(Entry.organisation_id == definition.organisation_id)
        count = await session.scalar(
            select(func.count()).select_from(Entry).where(*conditions)
        )
        return (count or 0) >= int(parameters["n"])
    if rule == AchievementRule.STREAK_DAYS.value:
        found = await streak(
            session, user_id, now=now, organisation_id=definition.organisation_id
        )
        return found.longest_days >= int(parameters["days"])
    if rule == AchievementRule.VISITED_ALL_STOPS_OF_TRAIL.value:
        return await _trail_completed(
            session, user_id, uuid.UUID(str(parameters["trail_id"]))
        )
    return False


async def evaluate_achievements(
    session: AsyncSession,
    user_id: uuid.UUID,
    *,
    organisation_id: str | None = None,
    now: datetime | None = None,
) -> list[AchievementDefinition]:
    """Award every met, not-yet-awarded achievement; idempotent. Returns the new ones.

    Considers platform definitions and, when given, the organisation's own.
    """
    scope: sa.ColumnElement[bool] = AchievementDefinition.organisation_id.is_(None)
    if organisation_id is not None:
        scope = or_(scope, AchievementDefinition.organisation_id == organisation_id)
    pending = await session.scalars(
        select(AchievementDefinition)
        .where(
            AchievementDefinition.active,
            scope,
            ~exists().where(
                AchievementAward.definition_id == AchievementDefinition.id,
                AchievementAward.user_id == user_id,
            ),
        )
        .order_by(AchievementDefinition.key)
    )
    awarded: list[AchievementDefinition] = []
    for definition in list(pending):
        if not await _rule_met(session, user_id, definition, now):
            continue
        try:
            async with session.begin_nested():
                session.add(
                    AchievementAward(user_id=user_id, definition_id=definition.id)
                )
                await session.flush()
        except IntegrityError:
            continue  # awarded concurrently
        awarded.append(definition)
    return awarded


async def my_achievements(
    session: AsyncSession, user_id: uuid.UUID
) -> list[dict[str, Any]]:
    """Earned achievements plus the active platform ones still to earn."""
    rows = (
        await session.execute(
            select(AchievementDefinition, AchievementAward.awarded_at)
            .outerjoin(
                AchievementAward,
                and_(
                    AchievementAward.definition_id == AchievementDefinition.id,
                    AchievementAward.user_id == user_id,
                ),
            )
            .where(
                or_(
                    AchievementAward.id.is_not(None),
                    and_(
                        AchievementDefinition.active,
                        AchievementDefinition.organisation_id.is_(None),
                    ),
                )
            )
            .order_by(AchievementDefinition.key)
        )
    ).all()
    return [achievement_view(definition, awarded_at) for definition, awarded_at in rows]


def achievement_view(
    definition: AchievementDefinition, awarded_at: datetime | None
) -> dict[str, Any]:
    return {
        "key": definition.key,
        "name": definition.name,
        "description": definition.description,
        "earned": awarded_at is not None,
        "awarded_at": awarded_at,
    }


# --- check-in -----------------------------------------------------------------------


@dataclass
class CheckInOutcome:
    check_in: CheckIn
    venue: Venue
    stamps_credited: int
    achievements: list[AchievementDefinition] = field(default_factory=list)


async def check_in(
    session: AsyncSession,
    *,
    user: User,
    token: str,
    now: datetime | None = None,
) -> CheckInOutcome:
    """Validate a venue QR token and record the visit.

    One check-in per person, venue and Grenada calendar day. Credits stamps
    through ``record_qualifying_action`` (source ``rewards.venue_check_in``),
    then evaluates achievements. A real-world scan only; there is no other path.
    """
    moment = now or utc_now()
    parsed = qr.parse_token(token)
    if parsed is None:
        raise InvalidCheckInCodeError()
    venue = await session.get(Venue, parsed.venue_id)
    if venue is None or not venue.active:
        raise InvalidCheckInCodeError()
    if not qr.verify_token(parsed, _venue_secret(venue), _timestamp(moment)):
        raise InvalidCheckInCodeError()

    day = local_today(moment)
    stop_id = await session.scalar(
        select(TrailStop.id)
        .join(Trail, Trail.id == TrailStop.trail_id)
        .where(
            TrailStop.venue_id == venue.id,
            Trail.status == TrailStatus.ACTIVE.value,
            or_(Trail.starts_on.is_(None), Trail.starts_on <= day),
            or_(Trail.ends_on.is_(None), Trail.ends_on >= day),
        )
        .order_by(Trail.created_at, TrailStop.position)
        .limit(1)
    )
    record = CheckIn(
        user_id=user.id,
        venue_id=venue.id,
        trail_stop_id=stop_id,
        local_date=day,
        created_at=moment,
    )
    try:
        async with session.begin_nested():
            session.add(record)
            await session.flush()
    except IntegrityError:
        raise RewardsConflictError("You have already checked in here today") from None

    entries = await service.record_qualifying_action(
        session,
        source_type=sources.VENUE_CHECK_IN,
        source_id=str(record.id),
        organisation_id=venue.organisation_id,
        user_id=user.id,
    )
    achievements = await evaluate_achievements(
        session, user.id, organisation_id=venue.organisation_id, now=moment
    )
    return CheckInOutcome(
        check_in=record,
        venue=venue,
        stamps_credited=sum(entry.amount for entry in entries),
        achievements=achievements,
    )
