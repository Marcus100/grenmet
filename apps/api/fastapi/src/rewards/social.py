"""Social layer (PF10): opt-in leaderboards, community challenges, stamp gifting.

Guardrails (ADR-0030), enforced by construction rather than by policy text:

* Everything is off by default: a feature flag (``rewards-leaderboards``,
  ``rewards-challenges``, ``rewards-gifting``; unknown = off) gates every route, and
  gifting additionally needs ``REWARDS_GIFTING_ENABLED`` which is refused in
  ``ENVIRONMENT=production`` whatever the flag says.
* Rankings and challenge totals count real-world actions already on record
  (distinct venue check-ins, trail stops, Events admissions). No query here reads
  an amount, a price or a balance, so spend cannot rank anyone.
* No random prizes, no reward for opening the app, no cash-out, no buying stamps:
  none of these has a table, column or code path. A challenge reward is text; a
  gift is a ``rewards.gift`` souvenir row, never a ``rewards.entry`` ledger row.

Service functions flush; routers commit.
"""

import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, time, timedelta
from typing import Any

import sqlalchemy as sa
from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.config import settings
from src.feature_flags import service as flags
from src.feature_flags.exceptions import FeatureOffError
from src.organisations.models import PlatformOrganisation
from src.utils.datetime import utc_now
from src.utils.timezones import GRENADA, local_to_utc

from . import sources
from .config import rewards_settings
from .exceptions import (
    ChallengeNotFoundError,
    GiftNotFoundError,
    LeaderboardScopeNotFoundError,
    RewardsConflictError,
    RewardsValidationError,
)
from .gamification import local_today
from .models import Entry, EntryKind, EntryStatus
from .models_gamification import CheckIn, Trail, TrailStatus, TrailStop, Venue
from .models_social import (
    Challenge,
    ChallengeMetric,
    ChallengeProgress,
    ChallengeStatus,
    Gift,
    GiftKind,
    LeaderboardOptIn,
    ScopeKind,
)
from .schemas_social import (
    ANONYMOUS_ALIAS,
    RewardsChallengeCreate,
    RewardsLeaderboardOptInCreate,
)

FLAG_LEADERBOARDS = "rewards-leaderboards"
FLAG_CHALLENGES = "rewards-challenges"
FLAG_GIFTING = "rewards-gifting"

NOT_ENOUGH_PARTICIPANTS = "Not enough participants yet to show a leaderboard"


# --- gating ------------------------------------------------------------------------


def gifting_hard_enabled() -> bool:
    """The hard switch. Never true in production, whatever the flag or setting say."""
    return rewards_settings.GIFTING_ENABLED and settings.ENVIRONMENT != "production"


async def require_social_flag(
    session: AsyncSession,
    key: str,
    *,
    user_id: uuid.UUID | None = None,
    organisation_id: str | None = None,
) -> None:
    """404 (a dark feature looks like it does not exist) unless the flag is on."""
    if not await flags.is_enabled(
        session, key, organisation_id=organisation_id, user_id=user_id
    ):
        raise FeatureOffError()


async def require_gifting(session: AsyncSession, user_id: uuid.UUID) -> None:
    if not gifting_hard_enabled():
        raise FeatureOffError()
    await require_social_flag(session, FLAG_GIFTING, user_id=user_id)


def _naive_utc(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        return moment
    return moment.astimezone(UTC).replace(tzinfo=None)


# --- action counts (the only thing that is ever ranked or totalled) ---------------


def _score_query(
    kind: ScopeKind, scope_id: str, metric: ChallengeMetric, user_column: Any
) -> sa.ScalarSelect[int]:
    """Per-person count of real-world actions, correlated to ``user_column``."""
    if kind is ScopeKind.ORGANISATION:
        if metric is ChallengeMetric.VENUE_CHECK_INS:
            query = (
                select(func.count(func.distinct(CheckIn.venue_id)))
                .join(Venue, Venue.id == CheckIn.venue_id)
                .where(
                    CheckIn.user_id == user_column, Venue.organisation_id == scope_id
                )
            )
        elif metric is ChallengeMetric.TRAIL_STOPS:
            query = (
                select(func.count(func.distinct(CheckIn.trail_stop_id)))
                .join(TrailStop, TrailStop.id == CheckIn.trail_stop_id)
                .join(Trail, Trail.id == TrailStop.trail_id)
                .where(
                    CheckIn.user_id == user_column, Trail.organisation_id == scope_id
                )
            )
        else:
            query = select(func.count(func.distinct(Entry.source_id))).where(
                Entry.account_id == user_column,
                Entry.organisation_id == scope_id,
                Entry.kind == EntryKind.EARN.value,
                Entry.source_type == sources.EVENTS_ADMISSION,
                Entry.status != EntryStatus.REVERSED.value,
            )
        return query.scalar_subquery()
    if metric is ChallengeMetric.EVENTS_ATTENDED:
        raise RewardsValidationError("Trail boards rank trail stops or venue visits")
    trail_id = uuid.UUID(scope_id)
    stops = select(TrailStop.venue_id).where(TrailStop.trail_id == trail_id)
    if metric is ChallengeMetric.VENUE_CHECK_INS:
        query = select(func.count(func.distinct(CheckIn.venue_id))).where(
            CheckIn.user_id == user_column, CheckIn.venue_id.in_(stops)
        )
    else:
        query = (
            select(func.count(func.distinct(CheckIn.trail_stop_id)))
            .join(TrailStop, TrailStop.id == CheckIn.trail_stop_id)
            .where(CheckIn.user_id == user_column, TrailStop.trail_id == trail_id)
        )
    return query.scalar_subquery()


# --- leaderboards ------------------------------------------------------------------


async def resolve_scope(
    session: AsyncSession, kind: ScopeKind, scope_id: str
) -> str | None:
    """Validate the scope and return its owning organisation (None = platform trail)."""
    if kind is ScopeKind.ORGANISATION:
        if await session.get(PlatformOrganisation, scope_id) is None:
            raise LeaderboardScopeNotFoundError()
        return scope_id
    try:
        trail = await session.get(Trail, uuid.UUID(scope_id))
    except ValueError:
        raise LeaderboardScopeNotFoundError() from None
    if trail is None or trail.status != TrailStatus.ACTIVE.value:
        raise LeaderboardScopeNotFoundError()
    return trail.organisation_id


async def opt_in(
    session: AsyncSession,
    *,
    user: User,
    kind: ScopeKind,
    scope_id: str,
    payload: RewardsLeaderboardOptInCreate,
    now: datetime | None = None,
) -> LeaderboardOptIn:
    """Consent to appear on one board. Re-opting after withdrawal reactivates the row."""
    moment = now or utc_now()
    row = await session.scalar(
        select(LeaderboardOptIn).where(
            LeaderboardOptIn.user_id == user.id,
            LeaderboardOptIn.scope_kind == kind.value,
            LeaderboardOptIn.scope_id == scope_id,
        )
    )
    if row is None:
        row = LeaderboardOptIn(
            user_id=user.id, scope_kind=kind.value, scope_id=scope_id
        )
        session.add(row)
    row.display_alias = payload.display_alias
    row.show_name = payload.show_name
    row.opted_in_at = moment
    row.withdrawn_at = None
    await session.flush()
    return row


async def withdraw(
    session: AsyncSession,
    *,
    user: User,
    kind: ScopeKind,
    scope_id: str,
    now: datetime | None = None,
) -> None:
    """Remove the person from the board at once. Idempotent."""
    await session.execute(
        sa.update(LeaderboardOptIn)
        .where(
            LeaderboardOptIn.user_id == user.id,
            LeaderboardOptIn.scope_kind == kind.value,
            LeaderboardOptIn.scope_id == scope_id,
            LeaderboardOptIn.withdrawn_at.is_(None),
        )
        .values(withdrawn_at=now or utc_now())
    )


async def my_opt_ins(session: AsyncSession, user: User) -> list[LeaderboardOptIn]:
    result = await session.scalars(
        select(LeaderboardOptIn)
        .where(LeaderboardOptIn.user_id == user.id)
        .order_by(LeaderboardOptIn.opted_in_at.desc())
    )
    return list(result)


@dataclass
class Board:
    kind: ScopeKind
    scope_id: str
    metric: ChallengeMetric
    available: bool
    reason: str | None
    rows: list[dict[str, Any]]
    my_rank: int | None
    my_score: int | None


def _display_name(
    alias: str | None, show_name: bool, first_name: str, last_name: str
) -> str:
    if show_name and first_name:
        initial = f" {last_name[:1]}." if last_name else ""
        return f"{first_name}{initial}"
    return alias or ANONYMOUS_ALIAS


async def leaderboard(
    session: AsyncSession,
    *,
    kind: ScopeKind,
    scope_id: str,
    metric: ChallengeMetric,
    limit: int,
    viewer_id: uuid.UUID | None,
) -> Board:
    """Top ``limit`` opted-in people plus the viewer's own rank.

    Only people with an active opt-in row are ever read. Below the minimum cohort
    no board is shown (a small group would identify its members).
    """
    limit = max(1, min(limit, rewards_settings.LEADERBOARD_MAX_ROWS))
    score = _score_query(kind, scope_id, metric, LeaderboardOptIn.user_id)
    in_scope = (
        LeaderboardOptIn.scope_kind == kind.value,
        LeaderboardOptIn.scope_id == scope_id,
        LeaderboardOptIn.withdrawn_at.is_(None),
    )
    cohort = await session.scalar(
        select(func.count()).select_from(LeaderboardOptIn).where(*in_scope)
    )
    if (cohort or 0) < rewards_settings.LEADERBOARD_MIN_COHORT:
        return Board(
            kind, scope_id, metric, False, NOT_ENOUGH_PARTICIPANTS, [], None, None
        )

    base = (
        select(
            LeaderboardOptIn.user_id.label("user_id"),
            LeaderboardOptIn.display_alias.label("alias"),
            LeaderboardOptIn.show_name.label("show_name"),
            LeaderboardOptIn.opted_in_at.label("opted_in_at"),
            User.first_name.label("first_name"),
            User.last_name.label("last_name"),
            score.label("score"),
        )
        .join(User, User.id == LeaderboardOptIn.user_id)
        .where(*in_scope)
        .subquery()
    )
    ranked = select(
        base,
        func.rank().over(order_by=base.c.score.desc()).label("rank"),
    ).subquery()
    top = await session.execute(
        select(ranked)
        .where(ranked.c.score > 0)
        .order_by(ranked.c.rank, ranked.c.opted_in_at)
        .limit(limit)
    )
    rows = [
        {
            "rank": row.rank,
            "display_name": _display_name(
                row.alias, row.show_name, row.first_name, row.last_name
            ),
            "score": row.score,
            "is_me": viewer_id is not None and row.user_id == viewer_id,
        }
        for row in top
    ]
    my_rank = my_score = None
    if viewer_id is not None:
        mine = (
            await session.execute(
                select(ranked.c.rank, ranked.c.score).where(
                    ranked.c.user_id == viewer_id
                )
            )
        ).first()
        if mine is not None:
            my_rank, my_score = mine.rank, mine.score
    return Board(kind, scope_id, metric, True, None, rows, my_rank, my_score)


# --- challenges --------------------------------------------------------------------


async def create_challenge(
    session: AsyncSession, *, organisation_id: str, payload: RewardsChallengeCreate
) -> Challenge:
    challenge = Challenge(
        organisation_id=organisation_id,
        name=payload.name,
        description=payload.description,
        metric=payload.metric.value,
        target_total=payload.target_total,
        starts_at=_naive_utc(payload.starts_at),
        ends_at=_naive_utc(payload.ends_at),
        reward_description=payload.reward_description,
    )
    session.add(challenge)
    await session.flush()
    return challenge


async def get_challenge(
    session: AsyncSession, challenge_id: uuid.UUID, *, organisation_id: str
) -> Challenge:
    challenge = await session.get(Challenge, challenge_id)
    if challenge is None or challenge.organisation_id != organisation_id:
        raise ChallengeNotFoundError()
    return challenge


async def set_challenge_status(
    session: AsyncSession, challenge: Challenge, status: ChallengeStatus
) -> Challenge:
    challenge.status = status.value
    await session.flush()
    return challenge


def _challenge_total_query(challenge: Challenge) -> sa.Select[Any]:
    """Collective count inside the window. Counts rows, never individuals."""
    window = (
        challenge.starts_at,
        challenge.ends_at,
    )
    owner = challenge.organisation_id
    metric = ChallengeMetric(challenge.metric)
    if metric is ChallengeMetric.VENUE_CHECK_INS:
        query = select(func.count(CheckIn.id)).join(Venue, Venue.id == CheckIn.venue_id)
        if owner is not None:
            query = query.where(Venue.organisation_id == owner)
        return query.where(CheckIn.created_at.between(*window))
    if metric is ChallengeMetric.TRAIL_STOPS:
        query = (
            select(func.count(CheckIn.id))
            .join(TrailStop, TrailStop.id == CheckIn.trail_stop_id)
            .join(Trail, Trail.id == TrailStop.trail_id)
        )
        if owner is not None:
            query = query.where(Trail.organisation_id == owner)
        return query.where(CheckIn.created_at.between(*window))
    query = select(func.count(func.distinct(Entry.source_id))).where(
        Entry.kind == EntryKind.EARN.value,
        Entry.source_type == sources.EVENTS_ADMISSION,
        Entry.status != EntryStatus.REVERSED.value,
        Entry.created_at.between(*window),
    )
    if owner is not None:
        query = query.where(Entry.organisation_id == owner)
    return query


async def challenge_view(
    session: AsyncSession, challenge: Challenge, *, now: datetime | None = None
) -> dict[str, Any]:
    """The challenge with its total computed from records now. Stamps the
    completion marker (once) the first time the target is met."""
    total = int(await session.scalar(_challenge_total_query(challenge)) or 0)
    marker = await session.get(ChallengeProgress, challenge.id)
    if marker is None and total >= challenge.target_total:
        moment = now or utc_now()
        await session.execute(
            pg_insert(ChallengeProgress)
            .values(
                challenge_id=challenge.id,
                completed_at=moment,
                total_at_completion=total,
            )
            .on_conflict_do_nothing()
        )
        await session.flush()
        marker = await session.get(ChallengeProgress, challenge.id)
        if marker is not None:
            await session.refresh(marker)
    return {
        "id": challenge.id,
        "organisation_id": challenge.organisation_id,
        "name": challenge.name,
        "description": challenge.description,
        "metric": challenge.metric,
        "target_total": challenge.target_total,
        "starts_at": challenge.starts_at,
        "ends_at": challenge.ends_at,
        "reward_description": challenge.reward_description,
        "status": challenge.status,
        "total": total,
        "completed": marker is not None,
        "completed_at": marker.completed_at if marker is not None else None,
    }


async def list_org_challenges(
    session: AsyncSession, *, organisation_id: str
) -> list[dict[str, Any]]:
    rows = await session.scalars(
        select(Challenge)
        .where(Challenge.organisation_id == organisation_id)
        .order_by(Challenge.starts_at.desc())
    )
    return [await challenge_view(session, row) for row in rows]


async def list_active_challenges(
    session: AsyncSession, *, now: datetime | None = None
) -> list[dict[str, Any]]:
    moment = now or utc_now()
    rows = await session.scalars(
        select(Challenge)
        .where(
            Challenge.status == ChallengeStatus.ACTIVE.value,
            Challenge.starts_at <= moment,
            Challenge.ends_at >= moment,
        )
        .order_by(Challenge.ends_at)
    )
    return [await challenge_view(session, row, now=moment) for row in rows]


# --- gifting -----------------------------------------------------------------------


def _short_name(user: User) -> str:
    initial = f" {user.last_name[:1]}." if user.last_name else ""
    return f"{user.first_name}{initial}"


def reversible_until(gift: Gift) -> datetime | None:
    if gift.reversed_at is not None:
        return None
    return gift.created_at + timedelta(hours=rewards_settings.GIFT_REVERSAL_HOURS)


async def create_gift(
    session: AsyncSession,
    *,
    sender: User,
    recipient_email: str,
    venue_id: uuid.UUID,
    now: datetime | None = None,
) -> Gift:
    """Copy one of the sender's own venue stamps to another account as a souvenir.

    Never touches ``rewards.entry``. Only a check-in the sender earned can be
    gifted, and a received gift is not a check-in, so there are no chains. The
    sender keeps their stamp. Caps count reversed gifts too, so reversing does not
    free capacity.
    """
    moment = now or utc_now()
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
        {"key": f"rewards-gift:{sender.id}"},
    )
    recipient = await session.scalar(
        select(User).where(
            func.lower(User.email) == recipient_email.lower(), User.is_active.is_(True)
        )
    )
    if recipient is None:
        raise GiftNotFoundError("No account found for that email")
    if recipient.id == sender.id:
        raise RewardsValidationError("You cannot gift a stamp to yourself")

    day_start = local_to_utc(local_today(moment), time.min, GRENADA)
    sent_today = await session.scalar(
        select(func.count())
        .select_from(Gift)
        .where(Gift.from_user_id == sender.id, Gift.created_at >= day_start)
    )
    if (sent_today or 0) >= rewards_settings.GIFT_DAILY_CAP_PER_SENDER:
        raise RewardsConflictError("Daily gift limit reached")
    received = await session.scalar(
        select(func.count()).select_from(Gift).where(Gift.to_user_id == recipient.id)
    )
    if (received or 0) >= rewards_settings.GIFT_LIFETIME_CAP_PER_RECIPIENT:
        raise RewardsConflictError("This person cannot receive more gifts")

    live = select(Gift.check_in_id).where(Gift.reversed_at.is_(None))
    check_in = await session.scalar(
        select(CheckIn)
        .where(
            CheckIn.user_id == sender.id,
            CheckIn.venue_id == venue_id,
            CheckIn.id.not_in(live),
        )
        .order_by(CheckIn.created_at.desc())
        .limit(1)
    )
    if check_in is None:
        raise GiftNotFoundError("You have no stamp from this venue left to gift")
    gift = Gift(
        from_user_id=sender.id,
        to_user_id=recipient.id,
        kind=GiftKind.PASSPORT_STAMP.value,
        check_in_id=check_in.id,
        venue_id=venue_id,
        created_at=moment,
    )
    try:
        async with session.begin_nested():
            session.add(gift)
            await session.flush()
    except IntegrityError:
        raise RewardsConflictError("That stamp has already been gifted") from None
    return gift


async def gift_view(session: AsyncSession, gift: Gift) -> dict[str, Any]:
    """A just-created gift as the sender sees it."""
    recipient = await session.get(User, gift.to_user_id)
    venue = await session.get(Venue, gift.venue_id)
    assert recipient is not None
    assert venue is not None
    return {
        "id": gift.id,
        "kind": gift.kind,
        "venue_name": venue.name,
        "counterpart_name": _short_name(recipient),
        "created_at": gift.created_at,
        "reversed_at": gift.reversed_at,
        "reversible_until": reversible_until(gift),
    }


async def reverse_gift(
    session: AsyncSession,
    *,
    sender: User,
    gift_id: uuid.UUID,
    now: datetime | None = None,
) -> Gift:
    """The sender may take a gift back within ``GIFT_REVERSAL_HOURS``."""
    moment = now or utc_now()
    gift = await session.get(Gift, gift_id, with_for_update=True)
    if gift is None or gift.from_user_id != sender.id:
        raise GiftNotFoundError()
    if gift.reversed_at is not None:
        raise RewardsConflictError("This gift was already reversed")
    if moment > gift.created_at + timedelta(hours=rewards_settings.GIFT_REVERSAL_HOURS):
        raise RewardsConflictError("The reversal window for this gift has passed")
    gift.reversed_at = moment
    await session.flush()
    return gift


async def list_gifts(
    session: AsyncSession, user: User, *, sent: bool
) -> list[dict[str, Any]]:
    """The caller's gifts. Received gifts hide reversed ones."""
    other = User.id == (Gift.to_user_id if sent else Gift.from_user_id)
    mine = Gift.from_user_id if sent else Gift.to_user_id
    query = (
        select(Gift, Venue.name, User)
        .join(Venue, Venue.id == Gift.venue_id)
        .join(User, other)
        .where(mine == user.id)
        .order_by(Gift.created_at.desc())
    )
    if not sent:
        query = query.where(Gift.reversed_at.is_(None))
    result = await session.execute(query)
    return [
        {
            "id": gift.id,
            "kind": gift.kind,
            "venue_name": venue_name,
            "counterpart_name": _short_name(counterpart),
            "created_at": gift.created_at,
            "reversed_at": gift.reversed_at,
            "reversible_until": reversible_until(gift) if sent else None,
        }
        for gift, venue_name, counterpart in result
    ]
