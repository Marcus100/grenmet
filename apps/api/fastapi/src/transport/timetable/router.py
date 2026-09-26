from typing import Any

from fastapi import APIRouter, status

from src.auth.browser import BrowserUser
from src.models import ApiError
from src.transport.dependencies import TransportSession

from . import schemas, service

router = APIRouter(tags=["transport"])

Responses = dict[int | str, dict[str, Any]]

FORBIDDEN: Responses = {
    status.HTTP_403_FORBIDDEN: {
        "model": ApiError,
        "description": "Insufficient permission",
    }
}
NOT_FOUND: Responses = {
    status.HTTP_404_NOT_FOUND: {"model": ApiError, "description": "Not found"}
}
CONFLICT: Responses = {
    status.HTTP_409_CONFLICT: {
        "model": ApiError,
        "description": "Conflicts with the timetable state",
    }
}
INVALID: Responses = {
    status.HTTP_422_UNPROCESSABLE_CONTENT: {
        "model": ApiError,
        "description": "Invalid timetable data",
    }
}
UNAVAILABLE: Responses = {
    status.HTTP_503_SERVICE_UNAVAILABLE: {
        "model": ApiError,
        "description": "Transport database unavailable",
    }
}


@router.get(
    "/access",
    response_model=schemas.TransportAccess,
    status_code=status.HTTP_200_OK,
    summary="Get my transport permissions",
    description="Returns which transport portal actions the signed-in user may take, so clients can show or hide controls. The API still enforces every permission.",
    responses={status.HTTP_401_UNAUTHORIZED: {"model": ApiError}},
)
async def get_access(*, user: BrowserUser) -> Any:
    return service.access(user)


@router.get(
    "/catalogue",
    response_model=schemas.TransportCatalogue,
    status_code=status.HTTP_200_OK,
    summary="Get the transport reference registry",
    description="Returns routes, shifts, stops (with the routes serving them today) and service calendars. Any signed-in user may read it.",
    responses={**UNAVAILABLE},
)
async def get_catalogue(*, _user: BrowserUser, session: TransportSession) -> Any:
    return await service.catalogue(session)


@router.post(
    "/routes",
    response_model=schemas.TransportRoute,
    status_code=status.HTTP_201_CREATED,
    summary="Create a route",
    description="Adds a route to the registry. Route numbers are unique.",
    responses={**FORBIDDEN, **CONFLICT, **UNAVAILABLE},
)
async def create_route_entry(
    *,
    user: BrowserUser,
    session: TransportSession,
    payload: schemas.TransportRouteInput,
) -> Any:
    return await service.create_route(session, user, payload)


@router.put(
    "/routes/{route_id}",
    response_model=schemas.TransportRoute,
    status_code=status.HTTP_200_OK,
    summary="Update a route",
    description="Changes a route's number, name, description or active flag. Takes effect immediately.",
    responses={**FORBIDDEN, **NOT_FOUND, **CONFLICT, **UNAVAILABLE},
)
async def update_route_entry(
    *,
    user: BrowserUser,
    session: TransportSession,
    route_id: int,
    payload: schemas.TransportRouteInput,
) -> Any:
    return await service.update_route(session, user, route_id, payload)


@router.post(
    "/stops",
    response_model=schemas.TransportStop,
    status_code=status.HTTP_201_CREATED,
    summary="Create a stop",
    description="Adds a pickup/drop-off point. Stop codes are unique and printable on signs and QR labels.",
    responses={**FORBIDDEN, **CONFLICT, **UNAVAILABLE},
)
async def create_stop(
    *, user: BrowserUser, session: TransportSession, payload: schemas.TransportStopInput
) -> Any:
    return await service.create_stop(session, user, payload)


@router.put(
    "/stops/{stop_id}",
    response_model=schemas.TransportStop,
    status_code=status.HTTP_200_OK,
    summary="Update a stop",
    description="Changes a stop's code, name, landmark, map location or active flag. Takes effect immediately.",
    responses={**FORBIDDEN, **NOT_FOUND, **CONFLICT, **UNAVAILABLE},
)
async def update_stop(
    *,
    user: BrowserUser,
    session: TransportSession,
    stop_id: int,
    payload: schemas.TransportStopInput,
) -> Any:
    return await service.update_stop(session, user, stop_id, payload)


@router.get(
    "/timetable/current",
    response_model=schemas.TimetableVersionDetail,
    status_code=status.HTTP_200_OK,
    summary="Get the timetable in force",
    description="Returns the published timetable in force today (Grenada time) with its trips and stop times. Any signed-in user may read it.",
    responses={**NOT_FOUND, **UNAVAILABLE},
)
async def get_current_timetable(
    *, _user: BrowserUser, session: TransportSession
) -> Any:
    return await service.current_timetable(session)


@router.get(
    "/timetable/versions",
    response_model=list[schemas.TimetableVersionSummary],
    status_code=status.HTTP_200_OK,
    summary="List timetable versions",
    description="Returns every timetable version, newest first, with its lifecycle state (draft, scheduled, current, superseded, discarded).",
    responses={**FORBIDDEN, **UNAVAILABLE},
)
async def list_timetable_versions(
    *, user: BrowserUser, session: TransportSession
) -> Any:
    return await service.list_versions(session, user)


@router.post(
    "/timetable/versions",
    response_model=schemas.TimetableVersionDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Start a timetable draft",
    description="Creates the single draft as a copy of the timetable in force. Fails if a draft already exists.",
    responses={**FORBIDDEN, **CONFLICT, **UNAVAILABLE},
)
async def create_timetable_draft(
    *,
    user: BrowserUser,
    session: TransportSession,
    payload: schemas.TimetableVersionCreate,
) -> Any:
    return await service.create_draft(session, user, payload)


@router.get(
    "/timetable/versions/{version_id}",
    response_model=schemas.TimetableVersionDetail,
    status_code=status.HTTP_200_OK,
    summary="Get a timetable version",
    description="Returns a version with its trips, stop times and validation issues.",
    responses={**FORBIDDEN, **NOT_FOUND, **UNAVAILABLE},
)
async def get_timetable_version(
    *, user: BrowserUser, session: TransportSession, version_id: int
) -> Any:
    return await service.version_detail(session, user, version_id)


@router.put(
    "/timetable/versions/{version_id}",
    response_model=schemas.TimetableVersionDetail,
    status_code=status.HTTP_200_OK,
    summary="Update a timetable draft",
    description="Changes the draft's label, notes and source reference.",
    responses={**FORBIDDEN, **NOT_FOUND, **CONFLICT, **UNAVAILABLE},
)
async def update_timetable_draft(
    *,
    user: BrowserUser,
    session: TransportSession,
    version_id: int,
    payload: schemas.TimetableVersionUpdate,
) -> Any:
    return await service.update_draft(session, user, version_id, payload)


@router.post(
    "/timetable/versions/{version_id}/discard",
    response_model=schemas.TimetableVersionSummary,
    status_code=status.HTTP_200_OK,
    summary="Discard a timetable draft",
    description="Marks the draft discarded. It is kept for reference and a new draft can be started.",
    responses={**FORBIDDEN, **NOT_FOUND, **CONFLICT, **UNAVAILABLE},
)
async def discard_timetable_draft(
    *, user: BrowserUser, session: TransportSession, version_id: int
) -> Any:
    return await service.discard_draft(session, user, version_id)


@router.post(
    "/timetable/versions/{version_id}/publish",
    response_model=schemas.TimetableVersionDetail,
    status_code=status.HTTP_200_OK,
    summary="Publish a timetable draft",
    description="Validates the draft and publishes it from the effective date (today or later). Blocking issues return 422.",
    responses={**FORBIDDEN, **NOT_FOUND, **CONFLICT, **INVALID, **UNAVAILABLE},
)
async def publish_timetable_draft(
    *,
    user: BrowserUser,
    session: TransportSession,
    version_id: int,
    payload: schemas.TimetablePublish,
) -> Any:
    return await service.publish_draft(session, user, version_id, payload)


@router.post(
    "/timetable/versions/{version_id}/trips",
    response_model=schemas.TimetableTripView,
    status_code=status.HTTP_201_CREATED,
    summary="Add a trip to a draft",
    description="Adds a trip with its ordered stop times to the draft.",
    responses={**FORBIDDEN, **NOT_FOUND, **CONFLICT, **INVALID, **UNAVAILABLE},
)
async def add_timetable_trip(
    *,
    user: BrowserUser,
    session: TransportSession,
    version_id: int,
    payload: schemas.TimetableTripInput,
) -> Any:
    return await service.add_trip(session, user, version_id, payload)


@router.put(
    "/timetable/versions/{version_id}/trips/{trip_id}",
    response_model=schemas.TimetableTripView,
    status_code=status.HTTP_200_OK,
    summary="Replace a trip in a draft",
    description="Replaces the trip's details and its full ordered stop list.",
    responses={**FORBIDDEN, **NOT_FOUND, **CONFLICT, **INVALID, **UNAVAILABLE},
)
async def replace_timetable_trip(
    *,
    user: BrowserUser,
    session: TransportSession,
    version_id: int,
    trip_id: int,
    payload: schemas.TimetableTripInput,
) -> Any:
    return await service.replace_trip(session, user, version_id, trip_id, payload)


@router.delete(
    "/timetable/versions/{version_id}/trips/{trip_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a trip from a draft",
    description="Deletes the trip and its stop times from the draft.",
    responses={
        status.HTTP_204_NO_CONTENT: {"description": "Trip removed"},
        **FORBIDDEN,
        **NOT_FOUND,
        **CONFLICT,
        **UNAVAILABLE,
    },
)
async def delete_timetable_trip(
    *,
    user: BrowserUser,
    session: TransportSession,
    version_id: int,
    trip_id: int,
) -> None:
    await service.delete_trip(session, user, version_id, trip_id)
