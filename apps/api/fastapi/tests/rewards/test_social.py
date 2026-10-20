"""PF10 social layer: opt-in leaderboards, community challenges, stamp gifting.

Everything is dark by default (feature flag, plus a hard setting for gifting that
production refuses). The banned mechanics stay impossible: spend ranking, random
prizes, app-open rewards, cash-out, buying stamps.
"""

import inspect
import uuid
from datetime import timedelta

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.config import settings
from src.feature_flags import service as flags
from src.feature_flags.models import FeatureFlag
from src.main import app
from src.organisations.config import organisations_settings
from src.organisations.models import MembershipRole
from src.rewards import gamification, service, social, sources
from src.rewards.config import rewards_settings
from src.rewards.exceptions import RewardsConflictError
from src.rewards.models import Entry, ProgramStatus
from src.rewards.models_gamification import CheckIn, Venue
from src.rewards.models_social import (
    ChallengeMetric,
    Gift,
    GiftKind,
    LeaderboardOptIn,
    ScopeKind,
)
from src.rewards.schemas import ProgramCreate
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/rewards"
LEADERBOARDS = social.FLAG_LEADERBOARDS
CHALLENGES = social.FLAG_CHALLENGES
GIFTING = social.FLAG_GIFTING


@pytest.fixture(autouse=True)
def secret_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    keys = [Fernet.generate_key().decode()]
    monkeypatch.setattr(organisations_settings, "ORG_SECRET_ENCRYPTION_KEYS", keys)


@pytest.fixture(autouse=True)
def fresh_flag_cache():
    flags.clear_cache()
    yield
    flags.clear_cache()


async def _flags_on(db: AsyncSession, *keys: str) -> None:
    for key in keys:
        db.add(FeatureFlag(key=key, enabled=True, audience={"everyone": True}))
    await db.commit()
    flags.clear_cache()


async def _org(db: AsyncSession, *, apps=("rewards",)):
    admin = await make_user(db)
    org = await make_org(
        db,
        f"Org {uuid.uuid4().hex[:6]}",
        members=((admin, MembershipRole.OWNER),),
        apps=apps,
    )
    return org, admin


async def _venue(db: AsyncSession, org_id: str, name: str = "V") -> Venue:
    venue = await gamification.create_venue(db, organisation_id=org_id, name=name)
    await db.commit()
    return venue


async def _visit(
    db: AsyncSession, user: User, venue: Venue, days_ago: int = 0
) -> CheckIn:
    moment = utc_now() - timedelta(days=days_ago)
    record = CheckIn(
        user_id=user.id,
        venue_id=venue.id,
        local_date=gamification.local_today(moment),
        created_at=moment,
    )
    db.add(record)
    await db.commit()
    return record


async def _cohort(
    db: AsyncSession,
    scope_id: str,
    size: int,
    *,
    kind: ScopeKind = ScopeKind.ORGANISATION,
) -> list[User]:
    users = [await make_user(db) for _ in range(size)]
    for user in users:
        db.add(
            LeaderboardOptIn(
                user_id=user.id,
                scope_kind=kind.value,
                scope_id=scope_id,
                display_alias=None,
            )
        )
    await db.commit()
    return users


async def _ledger_snapshot(db: AsyncSession) -> tuple[int, int]:
    count = await db.scalar(select(func.count()).select_from(Entry))
    total = await db.scalar(select(func.coalesce(func.sum(Entry.amount), 0)))
    return count or 0, total or 0


# --- flags and hard setting -----------------------------------------------------------


@pytest.mark.asyncio
async def test_every_social_route_is_404_while_flags_are_off(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    org, admin = await _org(db_async)
    user = await make_user(db_async)
    me, boss = headers_for(user), headers_for(admin, org.id)
    await _venue(db_async, org.id)

    calls = [
        ("put", f"{API}/me/leaderboard-opt-ins/organisation/{org.id}", me, {}),
        ("get", f"{API}/me/leaderboards/organisation/{org.id}", me, None),
        ("get", f"{API}/org/leaderboard", boss, None),
        ("get", f"{API}/me/challenges", me, None),
        ("get", f"{API}/org/challenges", boss, None),
        ("get", f"{API}/me/gifts/sent", me, None),
        ("get", f"{API}/me/gifts/received", me, None),
        (
            "post",
            f"{API}/me/gifts",
            me,
            {"recipient_email": "a@example.com", "venue_id": str(uuid.uuid4())},
        ),
        ("post", f"{API}/me/gifts/{uuid.uuid4()}/reverse", me, None),
    ]
    for method, url, headers, body in calls:
        response = await getattr(async_client, method)(
            url, headers=headers, **({"json": body} if body is not None else {})
        )
        assert response.status_code == 404, (url, response.text)
    # Consent can always be withdrawn, flag or no flag.
    gone = await async_client.delete(
        f"{API}/me/leaderboard-opt-ins/organisation/{org.id}", headers=me
    )
    assert gone.status_code == 204


@pytest.mark.asyncio
async def test_unknown_flag_is_off_and_gifting_needs_both_switches(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sender = await make_user(db_async)
    other = await make_user(db_async)
    org, _ = await _org(db_async)
    venue = await _venue(db_async, org.id)
    await _visit(db_async, sender, venue)
    body = {"recipient_email": other.email, "venue_id": str(venue.id)}
    headers = headers_for(sender)

    # Hard setting on, flag unknown: off.
    monkeypatch.setattr(rewards_settings, "GIFTING_ENABLED", True)
    assert (
        await async_client.post(f"{API}/me/gifts", headers=headers, json=body)
    ).status_code == 404

    # Flag on, hard setting off (the default): off.
    await _flags_on(db_async, GIFTING)
    monkeypatch.setattr(rewards_settings, "GIFTING_ENABLED", False)
    assert (
        await async_client.post(f"{API}/me/gifts", headers=headers, json=body)
    ).status_code == 404

    # Both on in a non-production environment: works.
    monkeypatch.setattr(rewards_settings, "GIFTING_ENABLED", True)
    created = await async_client.post(f"{API}/me/gifts", headers=headers, json=body)
    assert created.status_code == 201, created.text


@pytest.mark.asyncio
async def test_production_refuses_gifting_whatever_flag_and_setting_say(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert rewards_settings.GIFTING_ENABLED is False  # off by default
    await _flags_on(db_async, GIFTING)
    sender = await make_user(db_async)
    other = await make_user(db_async)
    org, _ = await _org(db_async)
    venue = await _venue(db_async, org.id)
    await _visit(db_async, sender, venue)
    monkeypatch.setattr(rewards_settings, "GIFTING_ENABLED", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "production")

    assert social.gifting_hard_enabled() is False
    headers = headers_for(sender)
    for method, url in (
        ("get", f"{API}/me/gifts/sent"),
        ("get", f"{API}/me/gifts/received"),
    ):
        assert (
            await getattr(async_client, method)(url, headers=headers)
        ).status_code == 404
    refused = await async_client.post(
        f"{API}/me/gifts",
        headers=headers,
        json={"recipient_email": other.email, "venue_id": str(venue.id)},
    )
    assert refused.status_code == 404
    assert await db_async.scalar(select(func.count()).select_from(Gift)) == 0


# --- leaderboards -------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_board_hides_small_cohorts_then_lists_only_opted_in_people(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _flags_on(db_async, LEADERBOARDS)
    org, _ = await _org(db_async)
    venue_a, venue_b = (
        await _venue(db_async, org.id, "A"),
        await _venue(db_async, org.id, "B"),
    )
    url = f"{API}/me/leaderboards/organisation/{org.id}"

    members = await _cohort(
        db_async, org.id, rewards_settings.LEADERBOARD_MIN_COHORT - 1
    )
    await _visit(db_async, members[0], venue_a)
    small = await async_client.get(url, headers=headers_for(members[0]))
    body = small.json()
    assert small.status_code == 200
    assert body["available"] is False
    assert body["rows"] == []
    assert "Not enough participants" in body["reason"]
    assert body["my_rank"] is None

    # The tenth person opts in through the API: now the board is shown.
    tenth = await make_user(db_async)
    opted = await async_client.put(
        f"{API}/me/leaderboard-opt-ins/organisation/{org.id}",
        headers=headers_for(tenth),
        json={"display_alias": "Nutmeg"},
    )
    assert opted.status_code == 200 and opted.json()["active"] is True
    # Two visitors who never opted in must never appear.
    lurker = await make_user(db_async)
    await _visit(db_async, lurker, venue_a)
    await _visit(db_async, lurker, venue_b)
    await _visit(db_async, tenth, venue_a)
    await _visit(db_async, tenth, venue_b)
    await _visit(db_async, tenth, await _venue(db_async, org.id, "C"))
    await _visit(db_async, members[0], venue_b)

    board = (await async_client.get(url, headers=headers_for(tenth))).json()
    assert board["available"] is True
    assert [(r["display_name"], r["score"]) for r in board["rows"]] == [
        ("Nutmeg", 3),
        ("Anonymous explorer", 2),
    ]
    assert board["my_rank"] == 1 and board["my_score"] == 3
    assert board["rows"][0]["is_me"] is True
    text = str(board)
    for user in [lurker, *members, tenth]:
        assert str(user.id) not in text and user.email not in text
        assert user.first_name not in text.replace("Anonymous explorer", "")

    # The lurker has no rank because they are not on the board.
    lurk = (await async_client.get(url, headers=headers_for(lurker))).json()
    assert lurk["my_rank"] is None and lurk["my_score"] is None

    # Withdrawal takes effect at once and drops the cohort below the minimum.
    gone = await async_client.delete(
        f"{API}/me/leaderboard-opt-ins/organisation/{org.id}",
        headers=headers_for(tenth),
    )
    assert gone.status_code == 204
    after = (await async_client.get(url, headers=headers_for(members[0]))).json()
    assert after["available"] is False and after["rows"] == []
    listing = await async_client.get(
        f"{API}/me/leaderboard-opt-ins", headers=headers_for(tenth)
    )
    assert listing.json()[0]["active"] is False
    # Opting in again reactivates the same row.
    again = await async_client.put(
        f"{API}/me/leaderboard-opt-ins/organisation/{org.id}",
        headers=headers_for(tenth),
        json={},
    )
    assert again.json()["active"] is True
    count = await db_async.scalar(
        select(func.count())
        .select_from(LeaderboardOptIn)
        .where(LeaderboardOptIn.user_id == tenth.id)
    )
    assert count == 1


@pytest.mark.asyncio
async def test_show_name_and_row_limit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _flags_on(db_async, LEADERBOARDS)
    org, _ = await _org(db_async)
    venue = await _venue(db_async, org.id)
    members = await _cohort(db_async, org.id, 12)
    for member in members:
        await _visit(db_async, member, venue)
    url = f"{API}/me/leaderboards/organisation/{org.id}"
    await async_client.put(
        f"{API}/me/leaderboard-opt-ins/organisation/{org.id}",
        headers=headers_for(members[0]),
        json={"show_name": True},
    )
    board = (
        await async_client.get(
            url, headers=headers_for(members[0]), params={"limit": 3}
        )
    ).json()
    assert len(board["rows"]) == 3
    assert "Test U." in [
        r["display_name"]
        for r in (
            await async_client.get(
                url, headers=headers_for(members[0]), params={"limit": 50}
            )
        ).json()["rows"]
    ]
    over = await async_client.get(
        url, headers=headers_for(members[0]), params={"limit": 51}
    )
    assert over.status_code == 422


@pytest.mark.asyncio
async def test_ranking_counts_actions_never_spend(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _flags_on(db_async, LEADERBOARDS)
    org, admin = await _org(db_async)
    venue = await _venue(db_async, org.id)
    members = await _cohort(db_async, org.id, 10)
    big_spender, walker = members[0], members[1]
    program = await service.create_program(
        db_async,
        organisation_id=org.id,
        actor=admin,
        payload=ProgramCreate(
            name="Pay",
            stamps_required=5,
            reward_description="r",
            qualifying_source_type=sources.PAYMENTS_SUCCEEDED,
        ),
    )
    await db_async.commit()
    for i in range(40):  # a lot of payments: ledger value is large
        await service.record_qualifying_action(
            db_async,
            source_type=sources.PAYMENTS_SUCCEEDED,
            source_id=f"pay-{i}",
            organisation_id=org.id,
            user_id=big_spender.id,
        )
    await db_async.commit()
    assert program.status == ProgramStatus.ACTIVE.value
    await _visit(db_async, walker, venue)

    url = f"{API}/me/leaderboards/organisation/{org.id}"
    board = (await async_client.get(url, headers=headers_for(big_spender))).json()
    assert board["my_score"] == 0  # spending counts for nothing
    assert board["rows"][0]["is_me"] is False and board["rows"][0]["score"] == 1
    assert len(board["rows"]) == 1  # zero-score people are not listed
    # Events attended counts admissions only, not payments either.
    events = (
        await async_client.get(
            url, headers=headers_for(big_spender), params={"metric": "events_attended"}
        )
    ).json()
    assert events["my_score"] == 0

    # Structural guard: the scoring code never reads an amount or a price.
    source = inspect.getsource(social._score_query) + inspect.getsource(
        social._challenge_total_query
    )
    for forbidden in ("amount", "total_minor", "price", "balance"):
        assert forbidden not in source
    assert {m.value for m in ChallengeMetric} == {
        "venue_check_ins",
        "trail_stops",
        "events_attended",
    }


@pytest.mark.asyncio
async def test_events_attended_board_and_organisation_isolation(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _flags_on(db_async, LEADERBOARDS)
    org_a, admin_a = await _org(db_async)
    org_b, _ = await _org(db_async)
    venue_a, venue_b = (
        await _venue(db_async, org_a.id),
        await _venue(db_async, org_b.id),
    )
    members = await _cohort(db_async, org_a.id, 10)
    await service.create_program(
        db_async,
        organisation_id=org_a.id,
        actor=admin_a,
        payload=ProgramCreate(name="E", stamps_required=3, reward_description="r"),
    )
    await db_async.commit()
    await service.record_qualifying_action(
        db_async,
        source_type=sources.EVENTS_ADMISSION,
        source_id="adm-1",
        organisation_id=org_a.id,
        user_id=members[0].id,
    )
    await db_async.commit()
    await _visit(db_async, members[1], venue_b)  # another organisation's venue
    await _visit(db_async, members[2], venue_a)

    url = f"{API}/me/leaderboards/organisation/{org_a.id}"
    events = (
        await async_client.get(
            url, headers=headers_for(members[0]), params={"metric": "events_attended"}
        )
    ).json()
    assert events["my_score"] == 1 and events["my_rank"] == 1
    visits = (await async_client.get(url, headers=headers_for(members[0]))).json()
    assert [r["score"] for r in visits["rows"]] == [
        1
    ]  # org B's venue is invisible here

    # Organisation zone: an admin sees only their own organisation's board, aliases only.
    own = await async_client.get(
        f"{API}/org/leaderboard", headers=headers_for(admin_a, org_a.id)
    )
    assert own.status_code == 200 and own.json()["scope_id"] == org_a.id
    assert own.json()["my_rank"] is None
    # ... and cannot name another organisation.
    foreign = await async_client.get(
        f"{API}/org/leaderboard", headers=headers_for(admin_a, org_b.id)
    )
    assert foreign.status_code in (403, 404)


@pytest.mark.asyncio
async def test_unknown_scopes_and_trail_boards(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _flags_on(db_async, LEADERBOARDS)
    user = await make_user(db_async)
    me = headers_for(user)
    assert (
        await async_client.get(f"{API}/me/leaderboards/organisation/nope", headers=me)
    ).status_code == 404
    assert (
        await async_client.get(f"{API}/me/leaderboards/trail/not-a-uuid", headers=me)
    ).status_code == 404
    assert (
        await async_client.get(
            f"{API}/me/leaderboards/trail/{uuid.uuid4()}", headers=me
        )
    ).status_code == 404
    assert (
        await async_client.get(f"{API}/me/leaderboards/team/x", headers=me)
    ).status_code == 422


# --- challenges ---------------------------------------------------------------------------


def _challenge_body(**over):
    now = utc_now()
    body = {
        "name": "Visit Gouyave",
        "description": "Together",
        "metric": "venue_check_ins",
        "target_total": 3,
        "starts_at": (now - timedelta(days=1)).isoformat() + "Z",
        "ends_at": (now + timedelta(days=5)).isoformat() + "Z",
        "reward_description": "A shout-out on our wall",
    }
    return {**body, **over}


@pytest.mark.asyncio
async def test_challenge_progress_is_computed_aggregate_and_marks_completion(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _flags_on(db_async, CHALLENGES)
    org, admin = await _org(db_async)
    venue = await _venue(db_async, org.id)
    boss = headers_for(admin, org.id)
    created = await async_client.post(
        f"{API}/org/challenges", headers=boss, json=_challenge_body()
    )
    assert created.status_code == 201, created.text
    challenge_id = created.json()["id"]
    assert created.json()["total"] == 0 and created.json()["completed"] is False
    # Totals cannot be set by hand.
    assert (
        await async_client.post(
            f"{API}/org/challenges", headers=boss, json=_challenge_body(total=99)
        )
    ).status_code == 201
    invalid = await async_client.post(
        f"{API}/org/challenges", headers=boss, json=_challenge_body(target_total=0)
    )
    assert invalid.status_code == 422
    backwards = await async_client.post(
        f"{API}/org/challenges",
        headers=boss,
        json=_challenge_body(ends_at="2000-01-01T00:00:00Z"),
    )
    assert backwards.status_code == 422

    visitors = [await make_user(db_async) for _ in range(3)]
    for visitor in visitors[:2]:
        await _visit(db_async, visitor, venue)
    me = headers_for(visitors[0])
    listing = (await async_client.get(f"{API}/me/challenges", headers=me)).json()
    mine = next(c for c in listing if c["id"] == challenge_id)
    assert mine["total"] == 2 and mine["completed"] is False
    # Aggregate only: no identity field, no identity value anywhere.
    assert set(mine) == {
        "id", "organisation_id", "name", "description", "metric", "target_total",
        "starts_at", "ends_at", "reward_description", "status", "total",
        "completed", "completed_at",
    }  # fmt: skip
    for visitor in visitors:
        assert str(visitor.id) not in str(listing) and visitor.email not in str(listing)

    await _visit(db_async, visitors[2], venue)
    done = next(
        c
        for c in (await async_client.get(f"{API}/me/challenges", headers=me)).json()
        if c["id"] == challenge_id
    )
    assert done["total"] == 3 and done["completed"] is True and done["completed_at"]
    # The marker is stable: a later look returns the same completion time.
    again = next(
        c
        for c in (await async_client.get(f"{API}/me/challenges", headers=me)).json()
        if c["id"] == challenge_id
    )
    assert again["completed_at"] == done["completed_at"]

    # Pause hides it from members; resume brings it back.
    paused = await async_client.post(
        f"{API}/org/challenges/{challenge_id}/pause", headers=boss
    )
    assert paused.json()["status"] == "paused"
    assert challenge_id not in [
        c["id"]
        for c in (await async_client.get(f"{API}/me/challenges", headers=me)).json()
    ]
    resumed = await async_client.post(
        f"{API}/org/challenges/{challenge_id}/resume", headers=boss
    )
    assert resumed.json()["status"] == "active"


@pytest.mark.asyncio
async def test_challenge_counts_only_own_window_and_organisation_and_isolates_admins(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    await _flags_on(db_async, CHALLENGES)
    org_a, admin_a = await _org(db_async)
    org_b, admin_b = await _org(db_async)
    no_entitlement, outsider = await _org(db_async, apps=())
    venue_a, venue_b = (
        await _venue(db_async, org_a.id),
        await _venue(db_async, org_b.id),
    )
    visitor = await make_user(db_async)
    await _visit(db_async, visitor, venue_a)
    await _visit(db_async, visitor, venue_b)
    await _visit(db_async, visitor, venue_a, days_ago=30)  # before the window

    boss_a = headers_for(admin_a, org_a.id)
    created = await async_client.post(
        f"{API}/org/challenges", headers=boss_a, json=_challenge_body(target_total=50)
    )
    assert created.json()["total"] == 1

    # Another organisation neither sees nor changes it.
    boss_b = headers_for(admin_b, org_b.id)
    assert (
        await async_client.get(f"{API}/org/challenges", headers=boss_b)
    ).json() == []
    other = await async_client.post(
        f"{API}/org/challenges/{created.json()['id']}/pause", headers=boss_b
    )
    assert other.status_code == 404
    # The rewards entitlement is required.
    blocked = await async_client.get(
        f"{API}/org/challenges", headers=headers_for(outsider, no_entitlement.id)
    )
    assert blocked.status_code in (402, 403, 404)
    # Plain members cannot create.
    member = await make_user(db_async)
    org_c = await make_org(
        db_async, "Third", members=((member, MembershipRole.MEMBER),), apps=("rewards",)
    )
    plain = await async_client.post(
        f"{API}/org/challenges",
        headers=headers_for(member, org_c.id),
        json=_challenge_body(),
    )
    assert plain.status_code == 403


# --- gifting ------------------------------------------------------------------------------


@pytest.fixture
async def gifting(db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(rewards_settings, "GIFTING_ENABLED", True)
    await _flags_on(db_async, GIFTING)


@pytest.mark.asyncio
@pytest.mark.usefixtures("gifting")
async def test_gift_is_a_souvenir_and_never_touches_the_ledger(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    org, admin = await _org(db_async)
    await service.create_program(
        db_async,
        organisation_id=org.id,
        actor=admin,
        payload=ProgramCreate(
            name="Card",
            stamps_required=2,
            reward_description="r",
            qualifying_source_type=sources.VENUE_CHECK_IN,
        ),
    )
    await db_async.commit()
    venue = await _venue(db_async, org.id, "Fort")
    sender, receiver = await make_user(db_async), await make_user(db_async)
    outcome = await gamification.check_in(
        db_async, user=sender, token=gamification.qr_token(venue)
    )
    await db_async.commit()
    assert outcome.stamps_credited == 1
    before = await _ledger_snapshot(db_async)
    cards_before = await service.cards(db_async, sender.id)

    sent = await async_client.post(
        f"{API}/me/gifts",
        headers=headers_for(sender),
        json={"recipient_email": receiver.email.upper(), "venue_id": str(venue.id)},
    )
    assert sent.status_code == 201, sent.text
    gift = sent.json()
    assert gift["kind"] == "passport_stamp" and gift["venue_name"] == "Fort"
    assert gift["counterpart_name"] == "Test U." and gift["reversible_until"]

    # No ledger row, no balance change for either person, no redeemable value.
    assert await _ledger_snapshot(db_async) == before
    assert await service.cards(db_async, sender.id) == cards_before
    assert await service.cards(db_async, receiver.id) == []
    assert {k.value for k in GiftKind} == {"passport_stamp"}

    received = (
        await async_client.get(
            f"{API}/me/gifts/received", headers=headers_for(receiver)
        )
    ).json()
    assert [g["id"] for g in received] == [gift["id"]]
    assert received[0]["counterpart_name"] == "Test U."
    sent_list = (
        await async_client.get(f"{API}/me/gifts/sent", headers=headers_for(sender))
    ).json()
    assert [g["id"] for g in sent_list] == [gift["id"]]
    # A third party sees nothing and cannot reverse it.
    stranger = headers_for(await make_user(db_async))
    assert (
        await async_client.get(f"{API}/me/gifts/received", headers=stranger)
    ).json() == []
    assert (
        await async_client.post(
            f"{API}/me/gifts/{gift['id']}/reverse", headers=stranger
        )
    ).status_code == 404
    assert (
        await async_client.post(
            f"{API}/me/gifts/{gift['id']}/reverse", headers=headers_for(receiver)
        )
    ).status_code == 404

    # The stamp was already gifted: nothing left to gift again.
    twice = await async_client.post(
        f"{API}/me/gifts",
        headers=headers_for(sender),
        json={"recipient_email": receiver.email, "venue_id": str(venue.id)},
    )
    assert twice.status_code == 404

    # Reversal by the sender hides it from the recipient; the ledger is untouched.
    undone = await async_client.post(
        f"{API}/me/gifts/{gift['id']}/reverse", headers=headers_for(sender)
    )
    assert undone.status_code == 204
    assert (
        await async_client.get(
            f"{API}/me/gifts/received", headers=headers_for(receiver)
        )
    ).json() == []
    assert await _ledger_snapshot(db_async) == before
    again = await async_client.post(
        f"{API}/me/gifts/{gift['id']}/reverse", headers=headers_for(sender)
    )
    assert again.status_code == 409


@pytest.mark.asyncio
@pytest.mark.usefixtures("gifting")
async def test_no_chains_self_gifts_and_unknown_recipients(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    org, _ = await _org(db_async)
    venue = await _venue(db_async, org.id)
    a = await make_user(db_async)
    b = await make_user(db_async)
    c = await make_user(db_async)
    await _visit(db_async, a, venue)

    def body(to: User | str):
        email = to.email if isinstance(to, User) else to
        return {"recipient_email": email, "venue_id": str(venue.id)}

    assert (
        await async_client.post(f"{API}/me/gifts", headers=headers_for(a), json=body(a))
    ).status_code == 422
    assert (
        await async_client.post(
            f"{API}/me/gifts", headers=headers_for(a), json=body("nobody@example.com")
        )
    ).status_code == 404
    first = await async_client.post(
        f"{API}/me/gifts", headers=headers_for(a), json=body(b)
    )
    assert first.status_code == 201
    # b holds a gifted stamp for that venue but never visited: it cannot be passed on.
    chain = await async_client.post(
        f"{API}/me/gifts", headers=headers_for(b), json=body(c)
    )
    assert chain.status_code == 404
    assert await db_async.scalar(select(func.count()).select_from(Gift)) == 1
    # Reversing frees the sender's own stamp to be gifted again.
    await async_client.post(
        f"{API}/me/gifts/{first.json()['id']}/reverse", headers=headers_for(a)
    )
    again = await async_client.post(
        f"{API}/me/gifts", headers=headers_for(a), json=body(c)
    )
    assert again.status_code == 201


@pytest.mark.asyncio
@pytest.mark.usefixtures("gifting")
async def test_gift_caps_and_reversal_window(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    assert rewards_settings.GIFT_DAILY_CAP_PER_SENDER == 3
    assert rewards_settings.GIFT_LIFETIME_CAP_PER_RECIPIENT == 10
    org, _ = await _org(db_async)
    venues = [await _venue(db_async, org.id, f"V{i}") for i in range(5)]
    sender = await make_user(db_async)
    receivers = [await make_user(db_async) for _ in range(2)]
    for venue in venues:
        await _visit(db_async, sender, venue)
    headers = headers_for(sender)

    async def gift(venue: Venue, to: User):
        return await async_client.post(
            f"{API}/me/gifts",
            headers=headers,
            json={"recipient_email": to.email, "venue_id": str(venue.id)},
        )

    made = [await gift(venues[i], receivers[0]) for i in range(3)]
    assert [r.status_code for r in made] == [201, 201, 201]
    capped = await gift(venues[3], receivers[1])
    assert capped.status_code == 409 and "Daily" in capped.json()["detail"]
    # Reversing does not free the daily allowance.
    await async_client.post(
        f"{API}/me/gifts/{made[0].json()['id']}/reverse", headers=headers
    )
    assert (await gift(venues[3], receivers[1])).status_code == 409

    # Per-recipient lifetime cap.
    monkeypatch.setattr(rewards_settings, "GIFT_DAILY_CAP_PER_SENDER", 50)
    monkeypatch.setattr(rewards_settings, "GIFT_LIFETIME_CAP_PER_RECIPIENT", 3)
    over = await gift(venues[4], receivers[0])
    assert over.status_code == 409 and "receive" in over.json()["detail"]
    assert (await gift(venues[4], receivers[1])).status_code == 201

    # Reversal window: after 24 hours the sender can no longer take it back.
    row = await db_async.get(Gift, uuid.UUID(made[1].json()["id"]))
    assert row is not None
    with pytest.raises(RewardsConflictError):
        await social.reverse_gift(
            db_async,
            sender=sender,
            gift_id=row.id,
            now=row.created_at + timedelta(hours=24, minutes=1),
        )
    await social.reverse_gift(
        db_async,
        sender=sender,
        gift_id=row.id,
        now=row.created_at + timedelta(hours=23),
    )
    assert row.reversed_at is not None


# --- guardrails ---------------------------------------------------------------------------


def test_banned_mechanics_have_no_route_or_source() -> None:
    banned = (
        "cash",
        "withdraw-funds",
        "buy",
        "purchase",
        "transfer",
        "loot",
        "random",
        "spin",
    )
    paths = [p for p in app.openapi()["paths"] if "/rewards" in p]
    assert any("leaderboards" in p for p in paths)
    for path in paths:
        assert not any(word in path for word in banned), path
    # Attention is never a source of stamps.
    assert not any(
        "open" in key or "login" in key for key in sources.QUALIFYING_SOURCES
    )
    # A gift is its own table, never a ledger entry.
    assert Gift.__table__.name == "gift" and Gift.__table__.name != Entry.__table__.name
    assert "Entry" not in inspect.getsource(social.create_gift)
