"""ADR-0066 slice 4a: the paused state of a Bookings business.

Pure decision, the evaluation service (audited, idempotent), its two triggers (the
daily job and the subscription webhook) and the public effects of a pause.
"""

import uuid
from collections.abc import AsyncGenerator
from datetime import datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.billing import app_subscriptions
from src.billing.gateway import WebhookEventResult
from src.billing.models import AppSubscription, AppSubscriptionTrial, Plan
from src.bookings import config as bookings_config
from src.bookings import paused
from src.bookings.models import BookingProfile
from src.organisations import service as organisation_service
from src.organisations.models import EntitlementSource, OrganisationApp
from src.utils.datetime import utc_now
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _slots,
    _studio,
)
from tests.bookings.test_public_listing import LISTING as LISTING_URL
from tests.bookings.test_public_listing import _business

PLAN = "bookings-monthly"
NOW = datetime(2026, 12, 1, 12, 0)
DAY_ = timedelta(days=1)
MESSAGE = "This business is not taking online bookings right now"


# --- pure decision -----------------------------------------------------------------


def _decide(**overrides: Any) -> bool:
    facts: dict[str, Any] = {
        "switch_on": True,
        "grant_enabled": True,
        "source": "trial",
        "now": NOW,
        "trial_ends_at": NOW - 8 * DAY_,
        "grant_created_at": NOW - 60 * DAY_,
        "has_paying_subscription": False,
        "subscription_ended_at": None,
    }
    facts.update(overrides)
    return paused.should_pause(**facts)


def test_pause_after_trial_and_grace() -> None:
    assert _decide() is True


def test_decision_within_grace_is_not_paused() -> None:
    assert _decide(trial_ends_at=NOW - 6 * DAY_) is False
    assert _decide(trial_ends_at=NOW - paused.GRACE) is True


def test_trial_still_running_is_not_paused() -> None:
    assert _decide(trial_ends_at=NOW + DAY_) is False


def test_switch_off_manual_and_disabled_never_pause() -> None:
    assert _decide(switch_on=False) is False
    assert _decide(source="manual") is False
    assert _decide(grant_enabled=False) is False


def test_active_or_past_due_subscription_is_not_paused() -> None:
    assert _decide(has_paying_subscription=True) is False


def test_grace_starts_at_the_later_of_trial_and_subscription_end() -> None:
    assert _decide(subscription_ended_at=NOW - 3 * DAY_) is False
    assert _decide(subscription_ended_at=NOW - 9 * DAY_) is True


def test_no_trial_and_no_subscription_counts_from_the_grant() -> None:
    assert _decide(trial_ends_at=None, grant_created_at=NOW - 3 * DAY_) is False
    assert _decide(trial_ends_at=None, grant_created_at=NOW - 8 * DAY_) is True


# --- service ------------------------------------------------------------------------


@pytest.fixture(autouse=True)
async def plan_seed(db_async: AsyncSession) -> AsyncGenerator[None]:
    db_async.add(
        Plan(
            key=PLAN,
            app_key="bookings",
            interval="month",
            active=True,
            name="Bookings monthly",
        )
    )
    await db_async.commit()
    yield


@pytest.fixture
def switch_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        bookings_config.bookings_settings, "ACCESS_FOLLOWS_SUBSCRIPTION", True
    )


async def _lapsed(
    db: AsyncSession,
    client: httpx.AsyncClient,
    *,
    source: EntitlementSource = EntitlementSource.TRIAL,
    trial_ended_days_ago: int = 10,
    **profile: object,
) -> Studio:
    """A business whose trial ended ``trial_ended_days_ago`` days ago."""
    studio = await _studio(db, client, **profile)
    await organisation_service.set_app_enabled(
        db,
        organisation_id=studio.org_id,
        app_key="bookings",
        enabled=True,
        source=source,
    )
    db.add(
        AppSubscriptionTrial(
            organisation_id=studio.org_id,
            plan_key=PLAN,
            trial_days=30,
            trial_ends_at=utc_now() - trial_ended_days_ago * DAY_,
        )
    )
    await db.commit()
    return studio


async def _paused_at(db: AsyncSession, org_id: str) -> datetime | None:
    value = await db.scalar(
        select(BookingProfile.paused_at)
        .where(BookingProfile.organisation_id == org_id)
        .execution_options(populate_existing=True)
    )
    return value


async def _subscribe(
    db: AsyncSession, org_id: str, status: str, **fields: object
) -> str:
    sub_id = f"sub_{uuid.uuid4().hex[:10]}"
    db.add(
        AppSubscription(
            organisation_id=org_id,
            plan_key=PLAN,
            app_key="bookings",
            channel="stripe",
            currency="XCD",
            status=status,
            stripe_subscription_id=sub_id,
            **fields,
        )
    )
    await db.commit()
    return sub_id


async def test_switch_off_nothing_pauses(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _lapsed(db_async, async_client)
    assert await paused.evaluate_all(db_async) == 0
    await db_async.commit()
    assert await _paused_at(db_async, studio.org_id) is None


@pytest.mark.usefixtures("switch_on")
async def test_lapsed_trial_pauses_and_is_audited_once(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _lapsed(db_async, async_client)
    assert await paused.evaluate_all(db_async) == 1
    await db_async.commit()
    assert await _paused_at(db_async, studio.org_id) is not None
    # Idempotent: a second run changes nothing and writes nothing more.
    assert await paused.evaluate_all(db_async) == 0
    await db_async.commit()
    entries = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.organisation_id == studio.org_id,
                AuditEntry.action.in_(("paused", "unpaused")),
            )
        )
    ).all()
    assert [e.action for e in entries] == ["paused"]


@pytest.mark.usefixtures("switch_on")
async def test_within_grace_is_not_paused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _lapsed(db_async, async_client, trial_ended_days_ago=3)
    await paused.evaluate_all(db_async)
    await db_async.commit()
    assert await _paused_at(db_async, studio.org_id) is None


@pytest.mark.usefixtures("switch_on")
@pytest.mark.parametrize("status", ["active", "past_due"])
async def test_paying_subscription_prevents_and_clears_a_pause(
    db_async: AsyncSession, async_client: httpx.AsyncClient, status: str
) -> None:
    studio = await _lapsed(db_async, async_client)
    await paused.evaluate_all(db_async)
    await db_async.commit()
    assert await _paused_at(db_async, studio.org_id) is not None
    await _subscribe(db_async, studio.org_id, status)
    await paused.evaluate_all(db_async)
    await db_async.commit()
    assert await _paused_at(db_async, studio.org_id) is None


@pytest.mark.usefixtures("switch_on")
async def test_canceled_subscription_grace_runs_from_its_end(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _lapsed(db_async, async_client, trial_ended_days_ago=40)
    await _subscribe(
        db_async,
        studio.org_id,
        "canceled",
        current_period_end=utc_now() - 2 * DAY_,
    )
    await paused.evaluate_all(db_async)
    await db_async.commit()
    assert await _paused_at(db_async, studio.org_id) is None


@pytest.mark.usefixtures("switch_on")
async def test_manual_grant_never_pauses_and_clears(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    manual = await _lapsed(db_async, async_client, source=EntitlementSource.MANUAL)
    await paused.evaluate_all(db_async)
    await db_async.commit()
    assert await _paused_at(db_async, manual.org_id) is None

    studio = await _lapsed(db_async, async_client)
    await paused.evaluate_all(db_async)
    await db_async.commit()
    assert await _paused_at(db_async, studio.org_id) is not None
    # Staff set the grant to manual: the next evaluation clears it.
    await db_async.execute(
        update(OrganisationApp)
        .where(
            OrganisationApp.organisation_id == studio.org_id,
            OrganisationApp.app_key == "bookings",
        )
        .values(source="manual")
    )
    await db_async.commit()
    await paused.evaluate_all(db_async)
    await db_async.commit()
    assert await _paused_at(db_async, studio.org_id) is None


async def test_turning_the_switch_off_clears(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        bookings_config.bookings_settings, "ACCESS_FOLLOWS_SUBSCRIPTION", True
    )
    studio = await _lapsed(db_async, async_client)
    await paused.evaluate_all(db_async)
    await db_async.commit()
    assert await _paused_at(db_async, studio.org_id) is not None
    monkeypatch.setattr(
        bookings_config.bookings_settings, "ACCESS_FOLLOWS_SUBSCRIPTION", False
    )
    assert await paused.evaluate_all(db_async) == 1
    await db_async.commit()
    assert await _paused_at(db_async, studio.org_id) is None


# --- webhook trigger -----------------------------------------------------------------


@pytest.mark.usefixtures("switch_on")
async def test_webhook_payment_resumes_a_paused_business(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _lapsed(db_async, async_client)
    await paused.evaluate_all(db_async)
    await db_async.commit()
    sub_id = await _subscribe(db_async, studio.org_id, "incomplete")
    event = WebhookEventResult(
        id=f"evt_{uuid.uuid4().hex[:10]}",
        type="customer.subscription.updated",
        object_id=sub_id,
        created=int(utc_now().timestamp()) + 5,
        data_object={"id": sub_id, "status": "active"},
    )
    assert await app_subscriptions.apply_stripe_event(db_async, event) == "applied"
    await db_async.commit()
    assert await _paused_at(db_async, studio.org_id) is None


@pytest.mark.usefixtures("switch_on")
async def test_a_failing_pause_check_never_blocks_the_subscription_update(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio = await _lapsed(db_async, async_client)
    sub_id = await _subscribe(db_async, studio.org_id, "incomplete")

    async def broken(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("bookings is down")

    monkeypatch.setattr(paused, "evaluate_organisation", broken)
    event = WebhookEventResult(
        id=f"evt_{uuid.uuid4().hex[:10]}",
        type="customer.subscription.updated",
        object_id=sub_id,
        created=int(utc_now().timestamp()) + 5,
        data_object={"id": sub_id, "status": "active"},
    )
    assert await app_subscriptions.apply_stripe_event(db_async, event) == "applied"
    await db_async.commit()
    status = await db_async.scalar(
        select(AppSubscription.status).where(
            AppSubscription.stripe_subscription_id == sub_id
        )
    )
    assert status == "active"


# --- public effects -------------------------------------------------------------------


async def _pause(db: AsyncSession, studio: Studio) -> None:
    await db.execute(
        update(BookingProfile)
        .where(BookingProfile.organisation_id == studio.org_id)
        .values(paused_at=utc_now())
    )
    await db.commit()


async def test_storefront_of_a_paused_business_shows_contact_and_no_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, contact_phone="+14735550100")
    open_page = await async_client.get(f"{API}/public/{studio.slug}")
    assert open_page.json()["accepting_bookings"] is True
    assert open_page.json()["services"]
    await _pause(db_async, studio)
    page = await async_client.get(f"{API}/public/{studio.slug}")
    assert page.status_code == 200
    body = page.json()
    assert body["accepting_bookings"] is False
    assert body["contact"]["phone"] == "+14735550100"
    assert body["services"] == []
    assert body["providers"] == []


async def test_paused_business_refuses_availability_code_and_create(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    await _pause(db_async, studio)

    availability = await async_client.get(
        f"{API}/public/{studio.slug}/availability",
        params={
            "service_id": studio.service_id,
            "first_day": "2026-12-07",
            "last_day": "2026-12-07",
        },
    )
    code = await async_client.post(
        f"{API}/public/{studio.slug}/email-code",
        json={
            "service_id": studio.service_id,
            "customer_email": "ada@example.com",
            "starts_at": slots[0],
        },
    )
    created = await _book(async_client, studio, slots[0])
    for response in (availability, code, created):
        assert response.status_code == 409, response.text
        assert response.json()["detail"] == MESSAGE
        assert response.json()["code"] == "BUSINESS_PAUSED"


async def test_manage_by_token_still_works_while_paused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    receipt = (await _book(async_client, studio, slots[0])).json()
    token = receipt["manage_token"]
    await _pause(db_async, studio)

    detail = await async_client.get(f"{API}/public/bookings/{token}")
    assert detail.status_code == 200
    ics = await async_client.get(f"{API}/public/bookings/{token}/ics")
    assert ics.status_code == 200
    cancelled = await async_client.post(f"{API}/public/bookings/{token}/cancel")
    assert cancelled.status_code == 200


async def test_listing_hides_a_paused_business(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _business(db_async, async_client)
    before = await async_client.get(LISTING_URL)
    assert studio.slug in [i["slug"] for i in before.json()["items"]]
    await _pause(db_async, studio)
    after = await async_client.get(LISTING_URL)
    assert studio.slug not in [i["slug"] for i in after.json()["items"]]


async def test_studio_reads_carry_paused_at(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    profile = await async_client.get(f"{API}/org/profile", headers=studio.headers)
    assert profile.json()["paused_at"] is None
    await _pause(db_async, studio)
    profile = await async_client.get(f"{API}/org/profile", headers=studio.headers)
    settings = await async_client.get(f"{API}/org/settings", headers=studio.headers)
    assert profile.json()["paused_at"] is not None
    assert settings.json()["profile"]["paused_at"] is not None
    # Studio writes are not refused in slice 4a.
    again = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={**profile.json(), "display_name": "Renamed"},
    )
    assert again.status_code == 200, again.text
