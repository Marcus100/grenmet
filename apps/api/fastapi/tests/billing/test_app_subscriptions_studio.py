# ruff: noqa: F401, F811  (sibling-module pytest fixtures: registered by import, requested by name)
"""ADR-0065 studio follow-ups: the bookings session, return URLs and trials.

Covers three gaps found while building the studio Plan & billing screen:

1. The subscription routes accept the bookings app session (role check unchanged).
2. Stripe success and cancel URLs are per organisation (studio plan page).
3. Trials are granted per organisation (Babydoll's first month), not per plan.

Test mode only: a fake gateway records the calls; nothing reaches Stripe.
"""

from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.utils import create_access_token
from src.billing import app_subscriptions
from src.billing.config import billing_settings
from src.billing.models import AppSubscriptionTrial
from src.bookings import seed as bookings_seed
from src.bookings.config import bookings_settings
from src.organisations.models import MembershipRole, PlatformOrganisation
from tests.billing.test_app_subscriptions import (
    API,
    PLAN,
    FakeAppGateway,
    _org,
    _price_config,
    _row,
    fake_gateway,
    plan_seed,
)
from tests.events.roles import user_with_role
from tests.organisations.support import headers_for, make_org

BOOKINGS_BASE = "https://studio.example.test"
CHECKOUT = f"{API}/checkout"


def _app_headers(
    user: User, organisation_id: str, app: str = "bookings"
) -> dict[str, str]:
    token = create_access_token(
        user.id,
        timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app=app,
    )
    return {
        "Authorization": f"Bearer {token}",
        "X-Barrels-Organisation": organisation_id,
    }


async def _studio(
    db: AsyncSession, role: MembershipRole
) -> tuple[User, PlatformOrganisation]:
    """A user with the bookings app access, and an organisation where they hold
    ``role``. The organisation is not entitled to bookings: subscribing is how it
    becomes entitled, so the routes must not require the entitlement."""
    user = await user_with_role(db, "bookings-member")
    org = await make_org(db, "Studio Plan Org", members=((user, role),))
    return user, org


# --- 1. The bookings app session --------------------------------------------------


@pytest.mark.usefixtures("plan_seed")
@pytest.mark.parametrize("role", [MembershipRole.ADMIN, MembershipRole.OWNER])
async def test_bookings_session_admin_can_list_and_checkout(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
    role: MembershipRole,
) -> None:
    user, org = await _studio(db_async, role)
    headers = _app_headers(user, org.id)

    listing = await async_client.get(API, headers=headers)
    checkout = await async_client.post(
        CHECKOUT, json={"plan_key": PLAN}, headers=headers
    )

    assert listing.status_code == 200
    assert listing.json()["data"] == []
    assert checkout.status_code == 201
    assert len(fake_gateway.calls) == 1
    assert fake_gateway.calls[0]["organisation_id"] == org.id


@pytest.mark.usefixtures("plan_seed")
async def test_bookings_session_member_is_refused_403(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    user, org = await _studio(db_async, MembershipRole.MEMBER)
    headers = _app_headers(user, org.id)

    listing = await async_client.get(API, headers=headers)
    checkout = await async_client.post(
        CHECKOUT, json={"plan_key": PLAN}, headers=headers
    )

    assert listing.status_code == 403
    assert checkout.status_code == 403
    assert fake_gateway.calls == []


@pytest.mark.usefixtures("plan_seed")
async def test_other_app_session_is_401(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    user, org = await _studio(db_async, MembershipRole.ADMIN)
    headers = _app_headers(user, org.id, app="events")

    listing = await async_client.get(API, headers=headers)
    checkout = await async_client.post(
        CHECKOUT, json={"plan_key": PLAN}, headers=headers
    )

    assert listing.status_code == 401
    assert "another app" in listing.text
    assert checkout.status_code == 401
    assert fake_gateway.calls == []


@pytest.mark.usefixtures("plan_seed")
async def test_bookings_session_outsider_is_404(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    _, org = await _studio(db_async, MembershipRole.OWNER)
    outsider = await user_with_role(db_async, "bookings-member")
    headers = _app_headers(outsider, org.id)

    listing = await async_client.get(API, headers=headers)
    checkout = await async_client.post(
        CHECKOUT, json={"plan_key": PLAN}, headers=headers
    )

    assert listing.status_code == 404
    assert checkout.status_code == 404
    assert fake_gateway.calls == []


# --- 2. Return URLs per organisation ----------------------------------------------


@pytest.mark.usefixtures("plan_seed")
async def test_return_urls_point_at_the_organisations_studio_plan_page(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bookings_settings, "APP_URL", BOOKINGS_BASE)
    user, org = await _studio(db_async, MembershipRole.ADMIN)

    response = await async_client.post(
        CHECKOUT, json={"plan_key": PLAN}, headers=_app_headers(user, org.id)
    )

    assert response.status_code == 201
    studio = f"{BOOKINGS_BASE}/studio/{org.slug}/plan"
    assert fake_gateway.calls[0]["success_url"] == f"{studio}?checkout=success"
    assert fake_gateway.calls[0]["cancel_url"] == f"{studio}?checkout=cancelled"


@pytest.mark.usefixtures("plan_seed")
async def test_client_cannot_choose_the_return_urls(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bookings_settings, "APP_URL", BOOKINGS_BASE)
    user, org = await _studio(db_async, MembershipRole.ADMIN)

    response = await async_client.post(
        CHECKOUT,
        json={
            "plan_key": PLAN,
            "success_url": "https://evil.example.test/win",
            "cancel_url": "https://evil.example.test/lose",
        },
        headers=_app_headers(user, org.id),
    )

    assert response.status_code == 201
    call = fake_gateway.calls[0]
    assert call["success_url"].startswith(f"{BOOKINGS_BASE}/studio/{org.slug}/")
    assert call["cancel_url"].startswith(f"{BOOKINGS_BASE}/studio/{org.slug}/")


@pytest.mark.usefixtures("plan_seed")
async def test_return_urls_fall_back_to_the_global_setting_without_a_base_url(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bookings_settings, "APP_URL", "")
    user, org = await _studio(db_async, MembershipRole.ADMIN)

    response = await async_client.post(
        CHECKOUT, json={"plan_key": PLAN}, headers=_app_headers(user, org.id)
    )

    assert response.status_code == 201
    call = fake_gateway.calls[0]
    assert call["success_url"] == str(billing_settings.CHECKOUT_SUCCESS_URL)
    assert call["cancel_url"] == str(billing_settings.CHECKOUT_CANCEL_URL)


def test_return_urls_fall_back_when_the_organisation_has_no_slug(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bookings_settings, "APP_URL", BOOKINGS_BASE)
    fallback = (
        str(billing_settings.CHECKOUT_SUCCESS_URL),
        str(billing_settings.CHECKOUT_CANCEL_URL),
    )

    assert app_subscriptions.checkout_return_urls(None) == fallback
    assert app_subscriptions.checkout_return_urls("") == fallback


# --- 3. Trials per organisation ---------------------------------------------------


@pytest.mark.usefixtures("plan_seed")
async def test_no_trial_unless_the_organisation_has_a_grant(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    user, org = await _org(db_async, MembershipRole.ADMIN)

    response = await async_client.post(
        CHECKOUT, json={"plan_key": PLAN}, headers=headers_for(user, org.id)
    )

    assert response.status_code == 201
    assert fake_gateway.calls[0]["trial_period_days"] is None


@pytest.mark.usefixtures("plan_seed")
async def test_granted_trial_days_reach_the_gateway_for_that_organisation_only(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    granted_user, granted = await _org(db_async, MembershipRole.ADMIN)
    other_user, other = await _org(db_async, MembershipRole.ADMIN)
    assert (
        await app_subscriptions.grant_trial(
            db_async, organisation_id=granted.id, plan_key=PLAN, trial_days=30
        )
        is True
    )
    await db_async.commit()

    await async_client.post(
        CHECKOUT, json={"plan_key": PLAN}, headers=headers_for(granted_user, granted.id)
    )
    await async_client.post(
        CHECKOUT, json={"plan_key": PLAN}, headers=headers_for(other_user, other.id)
    )

    assert fake_gateway.calls[0]["trial_period_days"] == 30
    assert fake_gateway.calls[1]["trial_period_days"] is None


@pytest.mark.usefixtures("plan_seed")
async def test_a_subscription_that_was_paid_once_gets_no_second_trial(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    user, org = await _org(db_async, MembershipRole.ADMIN)
    await app_subscriptions.grant_trial(
        db_async, organisation_id=org.id, plan_key=PLAN, trial_days=30
    )
    await _row(
        db_async,
        org.id,
        status="canceled",
        stripe_subscription_id="sub_test_paid_before",
    )

    response = await async_client.post(
        CHECKOUT, json={"plan_key": PLAN}, headers=headers_for(user, org.id)
    )

    assert response.status_code == 201
    assert fake_gateway.calls[0]["trial_period_days"] is None


@pytest.mark.usefixtures("plan_seed")
async def test_an_abandoned_checkout_keeps_the_trial(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_gateway: FakeAppGateway,
) -> None:
    user, org = await _org(db_async, MembershipRole.ADMIN)
    await app_subscriptions.grant_trial(
        db_async, organisation_id=org.id, plan_key=PLAN, trial_days=30
    )
    await db_async.commit()
    headers = headers_for(user, org.id)

    await async_client.post(CHECKOUT, json={"plan_key": PLAN}, headers=headers)
    # The first Checkout expires unpaid, so the pending row is replaced.
    fake_gateway.session_status["cs_test_app_fake_1"] = "expired"
    second = await async_client.post(CHECKOUT, json={"plan_key": PLAN}, headers=headers)

    assert second.status_code == 201
    assert fake_gateway.calls[1]["trial_period_days"] == 30


@pytest.mark.usefixtures("plan_seed")
async def test_grant_trial_is_create_only(db_async: AsyncSession) -> None:
    _, org = await _org(db_async, MembershipRole.ADMIN)

    first = await app_subscriptions.grant_trial(
        db_async, organisation_id=org.id, plan_key=PLAN, trial_days=30
    )
    second = await app_subscriptions.grant_trial(
        db_async, organisation_id=org.id, plan_key=PLAN, trial_days=60
    )
    await db_async.commit()

    assert (first, second) == (True, False)
    trial = await db_async.scalar(
        select(AppSubscriptionTrial).where(
            AppSubscriptionTrial.organisation_id == org.id
        )
    )
    assert trial is not None
    assert trial.trial_days == 30


@pytest.mark.usefixtures("plan_seed")
async def test_babydoll_seed_grants_the_first_month_free(
    db_async: AsyncSession,
) -> None:
    first = await bookings_seed.seed_babydoll(db_async)
    await db_async.commit()

    trial = await db_async.scalar(
        select(AppSubscriptionTrial).where(
            AppSubscriptionTrial.organisation_id == bookings_seed.ORGANISATION_ID,
            AppSubscriptionTrial.plan_key == PLAN,
        )
    )
    assert trial is not None
    assert trial.trial_days == 30
    assert f"trial:{PLAN}" in first.created

    second = await bookings_seed.seed_babydoll(db_async)
    assert f"trial:{PLAN}" not in second.created


async def test_babydoll_seed_without_the_plan_sets_no_trial_and_says_so(
    db_async: AsyncSession,
) -> None:
    result = await bookings_seed.seed_babydoll(db_async)

    assert f"trial:{PLAN}" not in result.created
    assert any("trial" in note for note in result.notes)
