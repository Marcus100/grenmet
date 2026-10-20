"""PF8 earn sources, PF9 gamification core, PF11 organisation ledger views."""

import uuid
from datetime import UTC, datetime, timedelta

import httpx
import pytest
from cryptography.fernet import Fernet
from pydantic import ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.organisations.config import organisations_settings
from src.organisations.models import MembershipRole
from src.rewards import gamification, qr, seed, service, sources
from src.rewards.exceptions import (
    InvalidCheckInCodeError,
    RewardsConflictError,
    RewardsValidationError,
)
from src.rewards.models import Entry, Program, ProgramStatus
from src.rewards.models_gamification import AchievementAward, CheckIn
from src.rewards.schemas import ProgramCreate
from src.rewards.schemas_gamification import (
    RewardsAchievementCreate,
    RewardsTrailCreate,
    RewardsTrailStopCreate,
)
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/rewards"
# 2026-10-20 12:00 UTC is 08:00 in Grenada (UTC-4, no daylight saving).
NOON = datetime(2026, 10, 20, 12, 0, 30)


@pytest.fixture(autouse=True)
def secret_keys(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    keys = [Fernet.generate_key().decode()]
    monkeypatch.setattr(organisations_settings, "ORG_SECRET_ENCRYPTION_KEYS", keys)
    return keys


async def _org(db: AsyncSession, *, admin: User | None = None, apps=("rewards",)):
    admin = admin or await make_user(db)
    org = await make_org(
        db,
        f"Org {uuid.uuid4().hex[:6]}",
        members=((admin, MembershipRole.OWNER),),
        apps=apps,
    )
    return org, admin


async def _program(
    db: AsyncSession,
    org_id: str,
    admin: User,
    source: str = sources.VENUE_CHECK_IN,
    stamps: int = 3,
) -> Program:
    program = await service.create_program(
        db,
        organisation_id=org_id,
        actor=admin,
        payload=ProgramCreate(
            name="Card",
            stamps_required=stamps,
            reward_description="A reward",
            qualifying_source_type=source,
        ),
    )
    await db.commit()
    return program


async def _check_in(
    db: AsyncSession, user: User, venue, at: datetime
) -> gamification.CheckInOutcome:
    await db.refresh(venue)
    await db.refresh(user)
    token = gamification.qr_token(venue, now=at)
    outcome = await gamification.check_in(db, user=user, token=token, now=at)
    await db.commit()
    return outcome


# --- PF8: earn sources --------------------------------------------------------------


def test_catalogue_lists_real_world_sources_only() -> None:
    assert set(sources.QUALIFYING_SOURCES) == {
        "events.admission",
        "bookings.completed",
        "billing.invoice_paid",
        "payments.succeeded",
        "rewards.venue_check_in",
    }
    # Guardrail: attention is never a source (no app-open, login or view events).
    assert not any(
        "open" in key or "login" in key for key in sources.QUALIFYING_SOURCES
    )
    assert sources.is_qualifying_source("bookings.completed")
    assert not sources.is_qualifying_source("app.opened")


def test_program_create_validates_source_against_catalogue() -> None:
    base = {"name": "n", "stamps_required": 2, "reward_description": "r"}
    assert ProgramCreate(**base).qualifying_source_type == "events.admission"
    assert (
        ProgramCreate(
            **base, qualifying_source_type="payments.succeeded"
        ).qualifying_source_type
        == "payments.succeeded"
    )
    with pytest.raises(ValidationError):
        ProgramCreate(**base, qualifying_source_type="app.opened")


@pytest.mark.asyncio
async def test_create_program_route_rejects_unknown_source(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    org, admin = await _org(db_async)
    headers = headers_for(admin, org.id)
    body = {"name": "n", "stamps_required": 2, "reward_description": "r"}
    bad = await async_client.post(
        f"{API}/programs", headers=headers, json={**body, "qualifying_source_type": "x"}
    )
    assert bad.status_code == 422
    good = await async_client.post(
        f"{API}/programs",
        headers=headers,
        json={**body, "qualifying_source_type": "bookings.completed"},
    )
    assert good.status_code == 201
    assert good.json()["qualifying_source_type"] == "bookings.completed"


@pytest.mark.asyncio
async def test_record_qualifying_action_credits_matching_programmes_and_replays_as_noop(
    db_async: AsyncSession,
) -> None:
    org, admin = await _org(db_async)
    other_org, other_admin = await _org(db_async)
    customer = await make_user(db_async)
    booking_card = await _program(
        db_async, org.id, admin, sources.BOOKINGS_COMPLETED, stamps=5
    )
    second_card = await _program(
        db_async, org.id, admin, sources.BOOKINGS_COMPLETED, stamps=2
    )
    await _program(db_async, org.id, admin, sources.EVENTS_ADMISSION)
    await _program(db_async, other_org.id, other_admin, sources.BOOKINGS_COMPLETED)

    kwargs = {
        "source_type": sources.BOOKINGS_COMPLETED,
        "source_id": "booking-1",
        "organisation_id": org.id,
        "user_id": customer.id,
    }
    created = await service.record_qualifying_action(db_async, **kwargs)
    assert {entry.program_id for entry in created} == {booking_card.id, second_card.id}
    assert await service.record_qualifying_action(db_async, **kwargs) == []
    await db_async.commit()
    total = await db_async.scalar(
        select(func.count()).select_from(Entry).where(Entry.account_id == customer.id)
    )
    assert total == 2


@pytest.mark.asyncio
async def test_record_qualifying_action_rejects_unknown_source_and_skips_paused(
    db_async: AsyncSession,
) -> None:
    org, admin = await _org(db_async)
    customer = await make_user(db_async)
    program = await _program(db_async, org.id, admin, sources.PAYMENTS_SUCCEEDED)
    with pytest.raises(RewardsValidationError):
        await service.record_qualifying_action(
            db_async,
            source_type="app.opened",
            source_id="x",
            organisation_id=org.id,
            user_id=customer.id,
        )
    program.status = ProgramStatus.PAUSED.value
    await db_async.commit()
    assert (
        await service.record_qualifying_action(
            db_async,
            source_type=sources.PAYMENTS_SUCCEEDED,
            source_id="pay-1",
            organisation_id=org.id,
            user_id=customer.id,
        )
        == []
    )


@pytest.mark.asyncio
async def test_record_qualifying_action_applies_the_velocity_flag(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.rewards.config import rewards_settings
    from src.rewards.models import ReviewFlag

    monkeypatch.setattr(rewards_settings, "VELOCITY_MAX_EARNS", 2)
    org, admin = await _org(db_async)
    customer = await make_user(db_async)
    await _program(db_async, org.id, admin, sources.PAYMENTS_SUCCEEDED)
    for n in range(4):
        await service.record_qualifying_action(
            db_async,
            source_type=sources.PAYMENTS_SUCCEEDED,
            source_id=f"pay-{n}",
            organisation_id=org.id,
            user_id=customer.id,
        )
    await db_async.commit()
    flags = await db_async.scalar(
        select(func.count())
        .select_from(ReviewFlag)
        .where(ReviewFlag.account_id == customer.id)
    )
    assert flags == 1


# --- PF9: signed QR -------------------------------------------------------------------


def test_qr_token_validity_window_and_tamper() -> None:
    venue_id = uuid.uuid4()
    secret = qr.new_secret()
    now = 1_800_000_030.0
    token = qr.make_token(secret, venue_id, now)
    assert token.startswith(f"v1.{venue_id}.")
    parsed = qr.parse_token(token)
    assert parsed is not None
    assert qr.verify_token(parsed, secret, now)
    # One window either side is tolerated, two are not.
    assert qr.verify_token(parsed, secret, now + 60)
    assert qr.verify_token(parsed, secret, now - 60)
    assert not qr.verify_token(parsed, secret, now + 120)
    assert not qr.verify_token(parsed, secret, now - 120)
    # Wrong secret, flipped MAC, swapped venue or window all fail.
    assert not qr.verify_token(parsed, qr.new_secret(), now)
    version, venue, window, mac = token.split(".")
    flipped = qr.parse_token(".".join([version, venue, window, "0" * len(mac)]))
    assert flipped is not None
    assert not qr.verify_token(flipped, secret, now)
    other_venue = qr.parse_token(".".join([version, str(uuid.uuid4()), window, mac]))
    assert other_venue is not None
    assert not qr.verify_token(other_venue, secret, now)
    next_window = qr.parse_token(".".join([version, venue, str(int(window) + 1), mac]))
    assert next_window is not None
    assert not qr.verify_token(next_window, secret, now)


@pytest.mark.parametrize(
    "token",
    [
        "",
        "garbage",
        "v2.a.b.c",
        f"v1.not-a-uuid.1.{'a' * 32}",
        "v1.00000000-0000-4000-8000-000000000001.x.y",
    ],
)
def test_qr_parse_rejects_malformed_tokens(token: str) -> None:
    assert qr.parse_token(token) is None


# --- PF9: venues, check-ins, streaks -----------------------------------------------------


@pytest.mark.asyncio
async def test_venue_secret_is_encrypted_and_never_returned(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    org, admin = await _org(db_async)
    headers = headers_for(admin, org.id)
    created = await async_client.post(
        f"{API}/org/venues", headers=headers, json={"name": "Cafe"}
    )
    assert created.status_code == 201
    assert "secret" not in created.text
    stored = await db_async.scalar(
        text("SELECT secret_encrypted FROM rewards.venue WHERE id = :id"),
        {"id": created.json()["id"]},
    )
    assert stored.startswith("fernet:v1:")
    listed = await async_client.get(f"{API}/org/venues", headers=headers)
    assert [v["name"] for v in listed.json()] == ["Cafe"]
    token = await async_client.get(
        f"{API}/org/venues/{created.json()['id']}/qr-token", headers=headers
    )
    assert token.status_code == 200
    assert token.json()["window_seconds"] == 60
    assert qr.parse_token(token.json()["token"]) is not None


@pytest.mark.asyncio
async def test_venue_create_is_503_without_encryption_keys(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org, admin = await _org(db_async)
    monkeypatch.setattr(organisations_settings, "ORG_SECRET_ENCRYPTION_KEYS", [])
    response = await async_client.post(
        f"{API}/org/venues", headers=headers_for(admin, org.id), json={"name": "Cafe"}
    )
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_check_in_route_credits_stamp_once_per_day(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    org, admin = await _org(db_async)
    await _program(db_async, org.id, admin)
    customer = await make_user(db_async)
    venue = await gamification.create_venue(db_async, organisation_id=org.id, name="V")
    await db_async.commit()

    headers = headers_for(customer)
    # The display shows a code; the customer scans it. Invalid codes are 400.
    bad = await async_client.post(
        f"{API}/me/check-ins", headers=headers, json={"token": "v1.nope.1.2.3"}
    )
    assert bad.status_code == 400
    missing = await async_client.post(f"{API}/me/check-ins", headers=headers, json={})
    assert missing.status_code == 422

    token = gamification.qr_token(venue)
    first = await async_client.post(
        f"{API}/me/check-ins", headers=headers, json={"token": token}
    )
    assert first.status_code == 201, first.text
    assert first.json()["stamps_credited"] == 1
    assert first.json()["venue_name"] == "V"
    again = await async_client.post(
        f"{API}/me/check-ins", headers=headers, json={"token": token}
    )
    assert again.status_code == 409
    card = (await async_client.get(f"{API}/me", headers=headers)).json()[0]
    assert card["balance"] == 1


@pytest.mark.asyncio
async def test_check_in_rejects_expired_tampered_and_inactive_codes(
    db_async: AsyncSession,
) -> None:
    org, _admin = await _org(db_async)
    customer = await make_user(db_async)
    venue = await gamification.create_venue(db_async, organisation_id=org.id, name="V")
    await db_async.commit()
    stale = gamification.qr_token(venue, now=NOON - timedelta(minutes=5))
    with pytest.raises(InvalidCheckInCodeError):
        await gamification.check_in(db_async, user=customer, token=stale, now=NOON)
    good = gamification.qr_token(venue, now=NOON)
    tampered = good[:-1] + ("0" if good[-1] != "0" else "1")
    with pytest.raises(InvalidCheckInCodeError):
        await gamification.check_in(db_async, user=customer, token=tampered, now=NOON)
    venue.active = False
    await db_async.commit()
    with pytest.raises(InvalidCheckInCodeError):
        await gamification.check_in(db_async, user=customer, token=good, now=NOON)
    count = await db_async.scalar(select(func.count()).select_from(CheckIn))
    assert count == 0


@pytest.mark.asyncio
async def test_one_check_in_per_venue_per_day_resets_at_grenada_midnight(
    db_async: AsyncSession,
) -> None:
    org, admin = await _org(db_async)
    await _program(db_async, org.id, admin, stamps=10)
    customer = await make_user(db_async)
    venue = await gamification.create_venue(db_async, organisation_id=org.id, name="V")
    await db_async.commit()

    # 23:59:30 in Grenada on 20 Oct is 03:59:30 UTC on 21 Oct.
    before_midnight = datetime(2026, 10, 21, 3, 59, 30)
    first = await _check_in(db_async, customer, venue, before_midnight)
    assert first.check_in.local_date.isoformat() == "2026-10-20"
    with pytest.raises(RewardsConflictError):
        await _check_in(
            db_async, customer, venue, before_midnight + timedelta(seconds=20)
        )
    await db_async.rollback()

    # 00:00:10 Grenada time on 21 Oct is a new day.
    after_midnight = datetime(2026, 10, 21, 4, 0, 10)
    second = await _check_in(db_async, customer, venue, after_midnight)
    assert second.check_in.local_date.isoformat() == "2026-10-21"
    with pytest.raises(RewardsConflictError):
        await _check_in(db_async, customer, venue, after_midnight + timedelta(hours=10))
    await db_async.rollback()
    # Another person on the same day is unaffected.
    other = await make_user(db_async)
    await _check_in(db_async, other, venue, after_midnight)
    await db_async.refresh(customer)
    await db_async.refresh(venue)
    # The database enforces it even if the service is bypassed.
    with pytest.raises(DBAPIError):
        await db_async.execute(
            text(
                "INSERT INTO rewards.check_in (id, user_id, venue_id, local_date, "
                "created_at) VALUES (gen_random_uuid(), :u, :v, '2026-10-21', now())"
            ),
            {"u": customer.id, "v": venue.id},
        )
    await db_async.rollback()


@pytest.mark.asyncio
async def test_streak_counts_consecutive_grenada_days(db_async: AsyncSession) -> None:
    org, _admin = await _org(db_async)
    customer = await make_user(db_async)
    venue = await gamification.create_venue(db_async, organisation_id=org.id, name="V")
    await db_async.commit()
    assert (
        await gamification.streak(db_async, customer.id, now=NOON)
    ).current_days == 0

    day = NOON
    for offset in (-6, -5, -4, -2, -1, 0):  # run of 3, gap, run of 3 ending today
        await _check_in(db_async, customer, venue, day + timedelta(days=offset))
    result = await gamification.streak(db_async, customer.id, now=NOON)
    assert (result.current_days, result.longest_days) == (3, 3)
    assert result.checked_in_today
    assert result.last_check_in is not None
    assert result.last_check_in.isoformat() == "2026-10-20"

    # Yesterday's run still counts today; it lapses after a missed day.
    tomorrow = await gamification.streak(
        db_async, customer.id, now=NOON + timedelta(days=1)
    )
    assert (tomorrow.current_days, tomorrow.checked_in_today) == (3, False)
    lapsed = await gamification.streak(
        db_async, customer.id, now=NOON + timedelta(days=2)
    )
    assert (lapsed.current_days, lapsed.longest_days) == (0, 3)


@pytest.mark.asyncio
async def test_streak_route(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    org, _admin = await _org(db_async)
    customer = await make_user(db_async)
    venue = await gamification.create_venue(db_async, organisation_id=org.id, name="V")
    await db_async.commit()
    now = datetime.now(UTC).replace(tzinfo=None)
    await _check_in(db_async, customer, venue, now)
    body = (
        await async_client.get(f"{API}/me/streak", headers=headers_for(customer))
    ).json()
    assert (body["current_days"], body["checked_in_today"]) == (1, True)


# --- PF9: trails, passport, achievements ----------------------------------------------------


@pytest.mark.asyncio
async def test_trail_progress_and_completion_achievement_is_idempotent(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    org, admin = await _org(db_async)
    headers = headers_for(admin, org.id)
    venues = [
        (
            await async_client.post(
                f"{API}/org/venues", headers=headers, json={"name": n}
            )
        ).json()
        for n in ("A", "B")
    ]
    trail = await async_client.post(
        f"{API}/org/trails",
        headers=headers,
        json={
            "name": "Two stops",
            "stops": [
                {"label": "Stop A", "venue_id": venues[0]["id"]},
                {"label": "Stop B", "venue_id": venues[1]["id"]},
            ],
        },
    )
    assert trail.status_code == 201, trail.text
    assert [s["position"] for s in trail.json()["stops"]] == [1, 2]
    achievement = await async_client.post(
        f"{API}/org/achievements",
        headers=headers,
        json={
            "key": "two-stops",
            "name": "Both stops",
            "rule_type": "visited_all_stops_of_trail",
            "parameters": {"trail_id": trail.json()["id"]},
        },
    )
    assert achievement.status_code == 201, achievement.text

    customer = await make_user(db_async)
    objs = {
        v["id"]: await db_async.get(gamification.Venue, uuid.UUID(v["id"]))
        for v in venues
    }
    first_venue, second_venue = (objs[v["id"]] for v in venues)

    first = await _check_in(db_async, customer, first_venue, NOON)
    assert first.achievements == []
    passport = await gamification.passport(db_async, customer.id, now=NOON)
    assert (
        passport[0]["stamped"],
        passport[0]["required"],
        passport[0]["completed"],
    ) == (1, 2, False)
    assert [s["stamped_at"] is not None for s in passport[0]["stops"]] == [True, False]

    second = await _check_in(
        db_async, customer, second_venue, NOON + timedelta(minutes=5)
    )
    assert [d.key for d in second.achievements] == ["two-stops"]
    assert (await gamification.passport(db_async, customer.id, now=NOON))[0][
        "completed"
    ]

    # Re-evaluating never awards twice.
    assert (
        await gamification.evaluate_achievements(
            db_async, customer.id, organisation_id=org.id, now=NOON
        )
        == []
    )
    await db_async.commit()
    awards = await db_async.scalar(
        select(func.count())
        .select_from(AchievementAward)
        .where(AchievementAward.user_id == customer.id)
    )
    assert awards == 1

    mine = await async_client.get(
        f"{API}/me/achievements", headers=headers_for(customer)
    )
    assert [(a["key"], a["earned"]) for a in mine.json()] == [("two-stops", True)]
    api_passport = await async_client.get(
        f"{API}/me/passport", headers=headers_for(customer)
    )
    assert api_passport.json()[0]["completed"] is True
    # A stranger sees neither the organisation's trail nor its achievement.
    stranger = headers_for(await make_user(db_async))
    assert (await async_client.get(f"{API}/me/passport", headers=stranger)).json() == []
    assert (
        await async_client.get(f"{API}/me/achievements", headers=stranger)
    ).json() == []


@pytest.mark.asyncio
async def test_streak_and_attendance_achievements(db_async: AsyncSession) -> None:
    org, admin = await _org(db_async)
    customer = await make_user(db_async)
    venue = await gamification.create_venue(db_async, organisation_id=org.id, name="V")
    streak_def = await gamification.create_definition(
        db_async,
        organisation_id=org.id,
        payload=RewardsAchievementCreate(
            key="three-days",
            name="3 days",
            rule_type="streak_days",
            parameters={"days": 3},
        ),
    )
    events_def = await gamification.create_definition(
        db_async,
        organisation_id=org.id,
        payload=RewardsAchievementCreate(
            key="regular",
            name="Regular",
            rule_type="attended_n_events",
            parameters={"n": 2},
        ),
    )
    await _program(db_async, org.id, admin, sources.EVENTS_ADMISSION)
    await db_async.commit()

    for offset in (-2, -1):
        outcome = await _check_in(
            db_async, customer, venue, NOON + timedelta(days=offset)
        )
        assert outcome.achievements == []
    done = await _check_in(db_async, customer, venue, NOON)
    assert [d.id for d in done.achievements] == [streak_def.id]

    for n in range(2):
        await service.record_qualifying_action(
            db_async,
            source_type=sources.EVENTS_ADMISSION,
            source_id=f"adm-{n}",
            organisation_id=org.id,
            user_id=customer.id,
        )
    awarded = await gamification.evaluate_achievements(
        db_async, customer.id, organisation_id=org.id, now=NOON
    )
    assert [d.id for d in awarded] == [events_def.id]


@pytest.mark.asyncio
async def test_definition_validation(db_async: AsyncSession) -> None:
    org, _admin = await _org(db_async)
    other, _ = await _org(db_async)
    other_trail = await gamification.create_trail(
        db_async, organisation_id=other.id, payload=RewardsTrailCreate(name="T")
    )
    bad = [
        ("a-1", "attended_n_events", {"n": 0}),
        ("a-2", "streak_days", {"days": 1}),
        ("a-3", "visited_all_stops_of_trail", {"trail_id": "nope"}),
        ("a-4", "visited_all_stops_of_trail", {"trail_id": str(other_trail.id)}),
    ]
    for key, rule, params in bad:
        with pytest.raises(RewardsValidationError):
            await gamification.create_definition(
                db_async,
                organisation_id=org.id,
                payload=RewardsAchievementCreate(
                    key=key, name="n", rule_type=rule, parameters=params
                ),
            )
    ok = RewardsAchievementCreate(
        key="dup", name="n", rule_type="streak_days", parameters={"days": 2}
    )
    await gamification.create_definition(db_async, organisation_id=org.id, payload=ok)
    with pytest.raises(RewardsConflictError):
        await gamification.create_definition(
            db_async, organisation_id=org.id, payload=ok
        )


def test_required_stop_needs_a_venue() -> None:
    with pytest.raises(ValidationError):
        RewardsTrailStopCreate(label="x")
    assert RewardsTrailStopCreate(label="x", required_check_in=False).venue_id is None


# --- isolation and entitlement ----------------------------------------------------------------


@pytest.mark.asyncio
async def test_organisation_routes_are_isolated_and_entitled(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    org_a, admin_a = await _org(db_async)
    org_b, admin_b = await _org(db_async)
    plain_org, plain_admin = await _org(db_async, apps=())
    member = await make_user(db_async)
    from src.organisations import service as org_service

    await org_service.add_member(
        db_async,
        organisation_id=org_a.id,
        user_id=member.id,
        role=MembershipRole.MEMBER,
    )
    await db_async.commit()
    headers_a, headers_b = (
        headers_for(admin_a, org_a.id),
        headers_for(admin_b, org_b.id),
    )

    venue = (
        await async_client.post(
            f"{API}/org/venues", headers=headers_a, json={"name": "A"}
        )
    ).json()
    trail = (
        await async_client.post(
            f"{API}/org/trails", headers=headers_a, json={"name": "T"}
        )
    ).json()

    # Another organisation cannot read or use them.
    assert (await async_client.get(f"{API}/org/venues", headers=headers_b)).json() == []
    assert (await async_client.get(f"{API}/org/trails", headers=headers_b)).json() == []
    assert (
        await async_client.get(
            f"{API}/org/venues/{venue['id']}/qr-token", headers=headers_b
        )
    ).status_code == 404
    assert (
        await async_client.patch(
            f"{API}/org/trails/{trail['id']}", headers=headers_b, json={"name": "x"}
        )
    ).status_code == 404
    stop = {"label": "S", "venue_id": venue["id"]}
    assert (
        await async_client.post(
            f"{API}/org/trails/{trail['id']}/stops", headers=headers_b, json=stop
        )
    ).status_code == 404
    own_trail = (
        await async_client.post(
            f"{API}/org/trails", headers=headers_b, json={"name": "B"}
        )
    ).json()
    foreign_venue = await async_client.post(
        f"{API}/org/trails/{own_trail['id']}/stops", headers=headers_b, json=stop
    )
    assert foreign_venue.status_code == 422

    # Entitlement and role.
    plain = headers_for(plain_admin, plain_org.id)
    for path in ("venues", "trails", "achievements", "entries", "redemptions"):
        assert (
            await async_client.get(f"{API}/org/{path}", headers=plain)
        ).status_code == 403
    assert (
        await async_client.post(f"{API}/org/venues", headers=plain, json={"name": "x"})
    ).status_code == 403
    as_member = headers_for(member, org_a.id)
    assert (
        await async_client.get(f"{API}/org/venues", headers=as_member)
    ).status_code == 200
    assert (
        await async_client.post(
            f"{API}/org/venues", headers=as_member, json={"name": "x"}
        )
    ).status_code == 403
    assert (
        await async_client.get(
            f"{API}/org/venues/{venue['id']}/qr-token", headers=as_member
        )
    ).status_code == 403
    assert (await async_client.get(f"{API}/org/venues")).status_code == 401


@pytest.mark.asyncio
async def test_check_in_credits_only_the_venue_organisation(
    db_async: AsyncSession,
) -> None:
    org_a, admin_a = await _org(db_async)
    org_b, admin_b = await _org(db_async)
    await _program(db_async, org_a.id, admin_a)
    await _program(db_async, org_b.id, admin_b)
    customer = await make_user(db_async)
    venue = await gamification.create_venue(
        db_async, organisation_id=org_a.id, name="V"
    )
    await db_async.commit()
    outcome = await _check_in(db_async, customer, venue, NOON)
    assert outcome.stamps_credited == 1
    orgs = set(
        await db_async.scalars(
            select(Entry.organisation_id).where(Entry.account_id == customer.id)
        )
    )
    assert orgs == {org_a.id}


# --- PF11: programme pause/resume and ledger views ----------------------------------------------


@pytest.mark.asyncio
async def test_pause_resume_and_ledger_views(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    org, admin = await _org(db_async)
    other, other_admin = await _org(db_async)
    program = await _program(
        db_async, org.id, admin, sources.PAYMENTS_SUCCEEDED, stamps=1
    )
    await _program(
        db_async, other.id, other_admin, sources.PAYMENTS_SUCCEEDED, stamps=1
    )
    customer = await make_user(db_async)
    headers = headers_for(admin, org.id)

    paused = await async_client.post(
        f"{API}/org/programs/{program.id}/pause", headers=headers
    )
    assert paused.json()["status"] == "paused"
    assert (
        await async_client.post(
            f"{API}/org/programs/{program.id}/pause", headers=headers
        )
    ).status_code == 200
    assert (
        await service.record_qualifying_action(
            db_async,
            source_type=sources.PAYMENTS_SUCCEEDED,
            source_id="p0",
            organisation_id=org.id,
            user_id=customer.id,
        )
        == []
    )
    resumed = await async_client.post(
        f"{API}/org/programs/{program.id}/resume", headers=headers
    )
    assert resumed.json()["status"] == "active"

    for source_id in ("p1", "p2"):
        await service.record_qualifying_action(
            db_async,
            source_type=sources.PAYMENTS_SUCCEEDED,
            source_id=source_id,
            organisation_id=org.id,
            user_id=customer.id,
        )
        await service.record_qualifying_action(
            db_async,
            source_type=sources.PAYMENTS_SUCCEEDED,
            source_id=source_id,
            organisation_id=other.id,
            user_id=customer.id,
        )
    await db_async.commit()
    redeem = await async_client.post(
        f"{API}/me/redemptions",
        headers=headers_for(customer),
        json={"program_id": str(program.id)},
    )
    assert redeem.status_code == 201

    entries = (await async_client.get(f"{API}/org/entries", headers=headers)).json()
    assert entries["count"] == 3  # two earns and one redemption, not the other org's
    assert "account_id" not in entries["data"][0]
    only_earns = (
        await async_client.get(f"{API}/org/entries?kind=earn", headers=headers)
    ).json()
    assert only_earns["count"] == 2
    redemptions = (
        await async_client.get(f"{API}/org/redemptions", headers=headers)
    ).json()
    assert [r["status"] for r in redemptions["data"]] == ["pending"]
    assert "redeem_code" not in redemptions["data"][0]
    # Another organisation cannot pause this programme.
    other_headers = headers_for(other_admin, other.id)
    assert (
        await async_client.post(
            f"{API}/org/programs/{program.id}/pause", headers=other_headers
        )
    ).status_code == 404


# --- ledger invariants stay intact ----------------------------------------------------------------


@pytest.mark.asyncio
async def test_check_in_earns_stay_append_only(db_async: AsyncSession) -> None:
    org, admin = await _org(db_async)
    await _program(db_async, org.id, admin)
    customer = await make_user(db_async)
    venue = await gamification.create_venue(db_async, organisation_id=org.id, name="V")
    await db_async.commit()
    await _check_in(db_async, customer, venue, NOON)
    entry = await db_async.scalar(select(Entry).where(Entry.account_id == customer.id))
    assert entry is not None
    assert entry.source_type == sources.VENUE_CHECK_IN
    source_id = entry.source_id or ""
    for statement in (
        "UPDATE rewards.entry SET amount = 9",
        "DELETE FROM rewards.entry",
    ):
        with pytest.raises(DBAPIError, match="append-only"):
            await db_async.execute(text(statement))
        await db_async.rollback()
    # Reversal still nets the check-in stamp out.
    assert (
        await service.reverse_for_source(db_async, sources.VENUE_CHECK_IN, source_id)
        == 1
    )


# --- seed ----------------------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_seed_parish_explorer_is_idempotent_and_playable(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    org, _admin = await _org(db_async)
    trail = await seed.seed_parish_explorer(db_async, organisation_id=org.id)
    again = await seed.seed_parish_explorer(db_async, organisation_id=org.id)
    await db_async.commit()
    assert again.id == trail.id
    stops = await gamification.trail_stops(db_async, trail.id)
    assert [s.label for s in stops] == list(seed.PARISHES)
    assert len(await gamification.list_venues(db_async, organisation_id=org.id)) == 6

    customer = await make_user(db_async)
    for index, stop in enumerate(stops):
        venue = await db_async.get(gamification.Venue, stop.venue_id)
        outcome = await _check_in(
            db_async, customer, venue, NOON + timedelta(minutes=index)
        )
    assert [d.name for d in outcome.achievements] == ["Parish Explorer"]

    monkeypatch.setattr(organisations_settings, "ORG_SECRET_ENCRYPTION_KEYS", [])
    other, _ = await _org(db_async)
    from src.organisations.exceptions import SecretStorageUnavailableError

    with pytest.raises(SecretStorageUnavailableError):
        await seed.seed_parish_explorer(db_async, organisation_id=other.id)
