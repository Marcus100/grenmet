"""Social layer routes (PF10). Every route is dark by default: a feature flag
(`rewards-leaderboards`, `rewards-challenges`, `rewards-gifting`) must be on, and
gifting also needs the REWARDS_GIFTING_ENABLED hard setting, which is refused in
production. Routers commit; service functions flush.
"""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Query, Response, status

from src.dependencies import AccountUser, SessionDep
from src.openapi_responses import (
    AUTHENTICATED,
    BAD_REQUEST,
    CONFLICT,
    NOT_FOUND,
    ResponseMap,
)

from . import social
from .config import rewards_settings
from .dependencies import RewardsOrgAdmin, RewardsOrgMember
from .models_social import ChallengeMetric, ChallengeStatus, ScopeKind
from .schemas_social import (
    RewardsChallengeCreate,
    RewardsChallengePublic,
    RewardsGiftCreate,
    RewardsGiftPublic,
    RewardsLeaderboardOptInCreate,
    RewardsLeaderboardOptInPublic,
    RewardsLeaderboardPublic,
    RewardsLeaderboardRow,
)

router = APIRouter()

ERRORS: ResponseMap = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}
FLAGGED = "Answers 404 while its feature flag is off."

MetricQuery = Annotated[ChallengeMetric, Query(description="Real-world action to rank")]
LimitQuery = Annotated[int, Query(ge=1, le=50, description="Rows to return (max 50)")]


def _board(board: social.Board) -> RewardsLeaderboardPublic:
    return RewardsLeaderboardPublic(
        scope_kind=board.kind,
        scope_id=board.scope_id,
        metric=board.metric,
        available=board.available,
        reason=board.reason,
        min_cohort=rewards_settings.LEADERBOARD_MIN_COHORT,
        rows=[RewardsLeaderboardRow(**row) for row in board.rows],
        my_rank=board.my_rank,
        my_score=board.my_score,
    )


def _opt_in(row: Any) -> RewardsLeaderboardOptInPublic:
    return RewardsLeaderboardOptInPublic(
        scope_kind=row.scope_kind,
        scope_id=row.scope_id,
        display_alias=row.display_alias,
        show_name=row.show_name,
        opted_in_at=row.opted_in_at,
        active=row.withdrawn_at is None,
    )


# --- leaderboards -------------------------------------------------------------------


@router.get(
    "/me/leaderboard-opt-ins",
    response_model=list[RewardsLeaderboardOptInPublic],
    summary="My leaderboard opt-ins",
    description="Boards I have joined or left. Always available, so I can withdraw.",
    operation_id="rewardsListMyLeaderboardOptIns",
    responses={**AUTHENTICATED},
)
async def list_my_opt_ins(*, session: SessionDep, current_user: AccountUser) -> Any:
    return [_opt_in(row) for row in await social.my_opt_ins(session, current_user)]


@router.put(
    "/me/leaderboard-opt-ins/{scope_kind}/{scope_id}",
    response_model=RewardsLeaderboardOptInPublic,
    summary="Opt in to a leaderboard",
    description=(
        "Consent to appear on the organisation or trail board. Names stay "
        "hidden unless show_name is set; otherwise the alias (default "
        f"'Anonymous explorer') is shown. {FLAGGED}"
    ),
    operation_id="rewardsOptInToLeaderboard",
    responses={**ERRORS},
)
async def opt_in_to_leaderboard(
    *,
    session: SessionDep,
    current_user: AccountUser,
    scope_kind: ScopeKind,
    scope_id: str,
    payload: RewardsLeaderboardOptInCreate,
) -> Any:
    organisation_id = await social.resolve_scope(session, scope_kind, scope_id)
    await social.require_social_flag(
        session,
        social.FLAG_LEADERBOARDS,
        user_id=current_user.id,
        organisation_id=organisation_id,
    )
    row = await social.opt_in(
        session,
        user=current_user,
        kind=scope_kind,
        scope_id=scope_id,
        payload=payload,
    )
    await session.commit()
    return _opt_in(row)


@router.delete(
    "/me/leaderboard-opt-ins/{scope_kind}/{scope_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Withdraw from a leaderboard",
    description=(
        "Removes me from the board immediately. Idempotent, and never behind a "
        "feature flag, so consent can always be withdrawn."
    ),
    operation_id="rewardsWithdrawFromLeaderboard",
    responses={**AUTHENTICATED},
)
async def withdraw_from_leaderboard(
    *,
    session: SessionDep,
    current_user: AccountUser,
    scope_kind: ScopeKind,
    scope_id: str,
) -> Response:
    await social.withdraw(
        session, user=current_user, kind=scope_kind, scope_id=scope_id
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/me/leaderboards/{scope_kind}/{scope_id}",
    response_model=RewardsLeaderboardPublic,
    summary="A leaderboard",
    description=(
        "Opted-in people ranked by a count of real-world actions (venue visits, "
        "trail stops, events attended), never by money. Up to 50 rows plus my own "
        "rank. Fewer than 10 opted-in people gives an empty board with a reason. "
        f"{FLAGGED}"
    ),
    operation_id="rewardsGetLeaderboard",
    responses={**ERRORS},
)
async def get_leaderboard(
    *,
    session: SessionDep,
    current_user: AccountUser,
    scope_kind: ScopeKind,
    scope_id: str,
    metric: MetricQuery = ChallengeMetric.VENUE_CHECK_INS,
    limit: LimitQuery = 10,
) -> Any:
    organisation_id = await social.resolve_scope(session, scope_kind, scope_id)
    await social.require_social_flag(
        session,
        social.FLAG_LEADERBOARDS,
        user_id=current_user.id,
        organisation_id=organisation_id,
    )
    board = await social.leaderboard(
        session,
        kind=scope_kind,
        scope_id=scope_id,
        metric=metric,
        limit=limit,
        viewer_id=current_user.id,
    )
    return _board(board)


@router.get(
    "/org/leaderboard",
    response_model=RewardsLeaderboardPublic,
    summary="My organisation's leaderboard",
    description=(
        "The same opt-in, small-cohort-guarded board for my own organisation, "
        f"aliases only. {FLAGGED}"
    ),
    operation_id="rewardsOrgGetLeaderboard",
    responses={**ERRORS},
)
async def org_get_leaderboard(
    *,
    session: SessionDep,
    org: RewardsOrgMember,
    metric: MetricQuery = ChallengeMetric.VENUE_CHECK_INS,
    limit: LimitQuery = 10,
) -> Any:
    await social.require_social_flag(
        session,
        social.FLAG_LEADERBOARDS,
        user_id=org.user.id,
        organisation_id=org.organisation_id,
    )
    board = await social.leaderboard(
        session,
        kind=ScopeKind.ORGANISATION,
        scope_id=org.organisation_id,
        metric=metric,
        limit=limit,
        viewer_id=None,
    )
    return _board(board)


# --- challenges ---------------------------------------------------------------------


@router.get(
    "/org/challenges",
    response_model=list[RewardsChallengePublic],
    summary="List my organisation's challenges",
    description=f"Collective progress only. {FLAGGED}",
    operation_id="rewardsOrgListChallenges",
    responses={**ERRORS},
)
async def org_list_challenges(*, session: SessionDep, org: RewardsOrgMember) -> Any:
    await social.require_social_flag(
        session,
        social.FLAG_CHALLENGES,
        user_id=org.user.id,
        organisation_id=org.organisation_id,
    )
    rows = await social.list_org_challenges(
        session, organisation_id=org.organisation_id
    )
    await session.commit()
    return rows


@router.post(
    "/org/challenges",
    response_model=RewardsChallengePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a community challenge",
    description=(
        "A collective goal counted from check-ins and events attended inside "
        "the window. The reward is non-monetary text and creates no ledger "
        f"value. {FLAGGED}"
    ),
    operation_id="rewardsOrgCreateChallenge",
    responses={**ERRORS},
)
async def org_create_challenge(
    *, session: SessionDep, org: RewardsOrgAdmin, payload: RewardsChallengeCreate
) -> Any:
    await social.require_social_flag(
        session,
        social.FLAG_CHALLENGES,
        user_id=org.user.id,
        organisation_id=org.organisation_id,
    )
    challenge = await social.create_challenge(
        session, organisation_id=org.organisation_id, payload=payload
    )
    view = await social.challenge_view(session, challenge)
    await session.commit()
    return view


async def _set_status(
    session: SessionDep,
    org: RewardsOrgAdmin,
    challenge_id: uuid.UUID,
    new_status: ChallengeStatus,
) -> Any:
    await social.require_social_flag(
        session,
        social.FLAG_CHALLENGES,
        user_id=org.user.id,
        organisation_id=org.organisation_id,
    )
    challenge = await social.get_challenge(
        session, challenge_id, organisation_id=org.organisation_id
    )
    await social.set_challenge_status(session, challenge, new_status)
    view = await social.challenge_view(session, challenge)
    await session.commit()
    return view


@router.post(
    "/org/challenges/{challenge_id}/pause",
    response_model=RewardsChallengePublic,
    summary="Pause a challenge",
    description=f"Paused challenges are hidden from members. Idempotent. {FLAGGED}",
    operation_id="rewardsOrgPauseChallenge",
    responses={**ERRORS},
)
async def org_pause_challenge(
    *, session: SessionDep, org: RewardsOrgAdmin, challenge_id: uuid.UUID
) -> Any:
    return await _set_status(session, org, challenge_id, ChallengeStatus.PAUSED)


@router.post(
    "/org/challenges/{challenge_id}/resume",
    response_model=RewardsChallengePublic,
    summary="Resume a challenge",
    description=f"Idempotent. {FLAGGED}",
    operation_id="rewardsOrgResumeChallenge",
    responses={**ERRORS},
)
async def org_resume_challenge(
    *, session: SessionDep, org: RewardsOrgAdmin, challenge_id: uuid.UUID
) -> Any:
    return await _set_status(session, org, challenge_id, ChallengeStatus.ACTIVE)


@router.get(
    "/me/challenges",
    response_model=list[RewardsChallengePublic],
    summary="Active community challenges",
    description=(
        "Challenges running now with their collective progress. Aggregate only: "
        f"no individual identities. {FLAGGED}"
    ),
    operation_id="rewardsListActiveChallenges",
    responses={**AUTHENTICATED},
)
async def list_active_challenges(
    *, session: SessionDep, current_user: AccountUser
) -> Any:
    await social.require_social_flag(
        session, social.FLAG_CHALLENGES, user_id=current_user.id
    )
    rows = await social.list_active_challenges(session)
    await session.commit()
    return rows


# --- gifting ------------------------------------------------------------------------


@router.post(
    "/me/gifts",
    response_model=RewardsGiftPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Gift a passport stamp",
    description=(
        "Gives a souvenir copy of a stamp I earned at a venue to another "
        "account, found by email. It is a passport collectible, never a "
        "redeemable stamp, and cannot be gifted onward. Capped per sender per "
        "day (3) and per recipient for life (10); reversible by me for 24 "
        "hours. Answers 404 unless the feature flag and the REWARDS_GIFTING_ENABLED "
        "setting are on; the setting is refused in production."
    ),
    operation_id="rewardsCreateGift",
    responses={**ERRORS},
)
async def create_gift(
    *, session: SessionDep, current_user: AccountUser, payload: RewardsGiftCreate
) -> Any:
    await social.require_gifting(session, current_user.id)
    gift = await social.create_gift(
        session,
        sender=current_user,
        recipient_email=str(payload.recipient_email),
        venue_id=payload.venue_id,
    )
    view = await social.gift_view(session, gift)
    await session.commit()
    return view


@router.get(
    "/me/gifts/sent",
    response_model=list[RewardsGiftPublic],
    summary="Gifts I sent",
    description=f"Including reversed ones, newest first. {FLAGGED}",
    operation_id="rewardsListSentGifts",
    responses={**AUTHENTICATED},
)
async def list_sent_gifts(*, session: SessionDep, current_user: AccountUser) -> Any:
    await social.require_gifting(session, current_user.id)
    return await social.list_gifts(session, current_user, sent=True)


@router.get(
    "/me/gifts/received",
    response_model=list[RewardsGiftPublic],
    summary="Gifts I received",
    description=f"Reversed gifts are hidden, newest first. {FLAGGED}",
    operation_id="rewardsListReceivedGifts",
    responses={**AUTHENTICATED},
)
async def list_received_gifts(*, session: SessionDep, current_user: AccountUser) -> Any:
    await social.require_gifting(session, current_user.id)
    return await social.list_gifts(session, current_user, sent=False)


@router.post(
    "/me/gifts/{gift_id}/reverse",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reverse a gift I sent",
    description=(
        "Takes the gift back from the recipient. Only the sender, only within "
        f"24 hours; 409 afterwards. {FLAGGED}"
    ),
    operation_id="rewardsReverseGift",
    responses={**ERRORS},
)
async def reverse_gift(
    *, session: SessionDep, current_user: AccountUser, gift_id: uuid.UUID
) -> Response:
    await social.require_gifting(session, current_user.id)
    await social.reverse_gift(session, sender=current_user, gift_id=gift_id)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
