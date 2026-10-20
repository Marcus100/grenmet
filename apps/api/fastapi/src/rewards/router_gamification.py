"""Venues, trails, achievements (organisation zone) and check-ins, passport,
achievements, streak (account zone). Routers commit; service functions flush.
"""

import uuid
from typing import Any

from fastapi import APIRouter, status

from src.dependencies import AccountUser, SessionDep
from src.openapi_responses import (
    AUTHENTICATED,
    BAD_REQUEST,
    CONFLICT,
    NOT_FOUND,
    ResponseMap,
)

from . import gamification, qr
from .dependencies import RewardsOrgAdmin, RewardsOrgMember
from .schemas_gamification import (
    CheckInCreate,
    CheckInPublic,
    PassportTrailPublic,
    RewardsAchievementCreate,
    RewardsAchievementDefinitionPublic,
    RewardsAchievementPublic,
    RewardsQrTokenPublic,
    RewardsTrailCreate,
    RewardsTrailPublic,
    RewardsTrailStopCreate,
    RewardsTrailStopPublic,
    RewardsTrailUpdate,
    RewardsVenueCreate,
    RewardsVenuePublic,
    StreakPublic,
)

router = APIRouter()

WRITE_ERRORS: ResponseMap = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}
UNAVAILABLE: ResponseMap = {503: {"description": "Secret storage is not configured"}}


def _trail(trail: Any, stops: list[Any]) -> RewardsTrailPublic:
    return RewardsTrailPublic(
        id=trail.id,
        organisation_id=trail.organisation_id,
        name=trail.name,
        description=trail.description,
        kind=trail.kind,
        starts_on=trail.starts_on,
        ends_on=trail.ends_on,
        status=trail.status,
        stops=[
            RewardsTrailStopPublic(
                id=stop.id,
                position=stop.position,
                label=stop.label,
                venue_id=stop.venue_id,
                required_check_in=stop.required_check_in,
            )
            for stop in stops
        ],
    )


# --- organisation zone: venues ----------------------------------------------------


@router.get(
    "/org/venues",
    response_model=list[RewardsVenuePublic],
    summary="List my organisation's venues",
    description="Check-in venues of the organisation named in X-Barrels-Organisation.",
    operation_id="rewardsOrgListVenues",
    responses={**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND},
)
async def org_list_venues(*, session: SessionDep, org: RewardsOrgMember) -> Any:
    return await gamification.list_venues(session, organisation_id=org.organisation_id)


@router.post(
    "/org/venues",
    response_model=RewardsVenuePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a check-in venue",
    description=(
        "Creates a venue with its own signing secret, stored encrypted and "
        "never returned. Answers 503 when secret storage is not configured."
    ),
    operation_id="rewardsOrgCreateVenue",
    responses={**WRITE_ERRORS, **UNAVAILABLE},
)
async def org_create_venue(
    *, session: SessionDep, org: RewardsOrgAdmin, payload: RewardsVenueCreate
) -> Any:
    venue = await gamification.create_venue(
        session, organisation_id=org.organisation_id, name=payload.name
    )
    await session.commit()
    return venue


@router.get(
    "/org/venues/{venue_id}/qr-token",
    response_model=RewardsQrTokenPublic,
    summary="Current check-in code for the venue display",
    description=(
        "A signed code valid for about a minute (one window either side is "
        "tolerated). The display screen refetches it before it expires."
    ),
    operation_id="rewardsOrgGetVenueQrToken",
    responses={**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **UNAVAILABLE},
)
async def org_venue_qr_token(
    *, session: SessionDep, org: RewardsOrgAdmin, venue_id: uuid.UUID
) -> Any:
    venue = await gamification.get_venue(
        session, venue_id, organisation_id=org.organisation_id
    )
    return RewardsQrTokenPublic(
        token=gamification.qr_token(venue),
        window_seconds=qr.WINDOW_SECONDS,
        refresh_after_seconds=qr.WINDOW_SECONDS // 2,
    )


# --- organisation zone: trails ------------------------------------------------------


@router.get(
    "/org/trails",
    response_model=list[RewardsTrailPublic],
    summary="List my organisation's trails",
    description="Trails owned by the organisation, with their stops.",
    operation_id="rewardsOrgListTrails",
    responses={**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND},
)
async def org_list_trails(*, session: SessionDep, org: RewardsOrgMember) -> Any:
    rows = await gamification.list_trails(session, organisation_id=org.organisation_id)
    return [_trail(trail, stops) for trail, stops in rows]


@router.post(
    "/org/trails",
    response_model=RewardsTrailPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a trail",
    description=(
        "A trail is an ordered list of venues to visit. Required stops need a "
        "venue of this organisation; progress comes from check-ins."
    ),
    operation_id="rewardsOrgCreateTrail",
    responses={**WRITE_ERRORS},
)
async def org_create_trail(
    *, session: SessionDep, org: RewardsOrgAdmin, payload: RewardsTrailCreate
) -> Any:
    trail = await gamification.create_trail(
        session, organisation_id=org.organisation_id, payload=payload
    )
    stops = await gamification.trail_stops(session, trail.id)
    await session.commit()
    return _trail(trail, stops)


@router.patch(
    "/org/trails/{trail_id}",
    response_model=RewardsTrailPublic,
    summary="Update a trail",
    description="Rename, change the active window, or activate or archive a trail.",
    operation_id="rewardsOrgUpdateTrail",
    responses={**WRITE_ERRORS},
)
async def org_update_trail(
    *,
    session: SessionDep,
    org: RewardsOrgAdmin,
    trail_id: uuid.UUID,
    payload: RewardsTrailUpdate,
) -> Any:
    trail = await gamification.get_trail(
        session, trail_id, organisation_id=org.organisation_id
    )
    await gamification.update_trail(session, trail, payload)
    stops = await gamification.trail_stops(session, trail.id)
    await session.commit()
    return _trail(trail, stops)


@router.post(
    "/org/trails/{trail_id}/stops",
    response_model=RewardsTrailStopPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a stop to a trail",
    description="Appends a stop after the existing ones.",
    operation_id="rewardsOrgAddTrailStop",
    responses={**WRITE_ERRORS},
)
async def org_add_trail_stop(
    *,
    session: SessionDep,
    org: RewardsOrgAdmin,
    trail_id: uuid.UUID,
    payload: RewardsTrailStopCreate,
) -> Any:
    trail = await gamification.get_trail(
        session, trail_id, organisation_id=org.organisation_id
    )
    stop = await gamification.add_trail_stop(session, trail, payload)
    await session.commit()
    return stop


# --- organisation zone: achievements ---------------------------------------------------


@router.get(
    "/org/achievements",
    response_model=list[RewardsAchievementDefinitionPublic],
    summary="List my organisation's achievement definitions",
    description="Rules that award achievements for activity at this organisation.",
    operation_id="rewardsOrgListAchievements",
    responses={**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND},
)
async def org_list_achievements(*, session: SessionDep, org: RewardsOrgMember) -> Any:
    return await gamification.list_definitions(
        session, organisation_id=org.organisation_id
    )


@router.post(
    "/org/achievements",
    response_model=RewardsAchievementDefinitionPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create an achievement definition",
    description=(
        "Rule types: attended_n_events {n}, visited_all_stops_of_trail "
        "{trail_id}, streak_days {days}. Achievements are awarded from "
        "records, never bought or granted by hand."
    ),
    operation_id="rewardsOrgCreateAchievement",
    responses={**WRITE_ERRORS},
)
async def org_create_achievement(
    *, session: SessionDep, org: RewardsOrgAdmin, payload: RewardsAchievementCreate
) -> Any:
    definition = await gamification.create_definition(
        session, organisation_id=org.organisation_id, payload=payload
    )
    await session.commit()
    return definition


# --- the signed-in account ------------------------------------------------------------


@router.post(
    "/me/check-ins",
    response_model=CheckInPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Check in at a venue",
    description=(
        "Submit the code scanned from the venue's display. One check-in per "
        "venue per Grenada day (409 on a repeat); an invalid or expired code "
        "answers 400. Credits matching stamp cards and advances trails."
    ),
    operation_id="rewardsCreateCheckIn",
    responses={**WRITE_ERRORS, **UNAVAILABLE},
)
async def create_check_in(
    *, session: SessionDep, current_user: AccountUser, payload: CheckInCreate
) -> Any:
    outcome = await gamification.check_in(
        session, user=current_user, token=payload.token
    )
    await session.commit()
    return CheckInPublic(
        id=outcome.check_in.id,
        venue_name=outcome.venue.name,
        local_date=outcome.check_in.local_date,
        stamps_credited=outcome.stamps_credited,
        achievements=[
            RewardsAchievementPublic(
                **gamification.achievement_view(definition, outcome.check_in.created_at)
            )
            for definition in outcome.achievements
        ],
    )


@router.get(
    "/me/passport",
    response_model=list[PassportTrailPublic],
    summary="My passport",
    description="Trails with the stops the account has stamped, derived from check-ins.",
    operation_id="rewardsGetPassport",
    responses={**AUTHENTICATED},
)
async def get_passport(*, session: SessionDep, current_user: AccountUser) -> Any:
    return await gamification.passport(session, current_user.id)


@router.get(
    "/me/achievements",
    response_model=list[RewardsAchievementPublic],
    summary="My achievements",
    description="Earned achievements and the platform ones still to earn.",
    operation_id="rewardsListMyAchievements",
    responses={**AUTHENTICATED},
)
async def list_my_achievements(
    *, session: SessionDep, current_user: AccountUser
) -> Any:
    return await gamification.my_achievements(session, current_user.id)


@router.get(
    "/me/streak",
    response_model=StreakPublic,
    summary="My check-in streak",
    description="Consecutive Grenada calendar days with a venue check-in.",
    operation_id="rewardsGetStreak",
    responses={**AUTHENTICATED},
)
async def get_streak(*, session: SessionDep, current_user: AccountUser) -> Any:
    return await gamification.streak(session, current_user.id)
