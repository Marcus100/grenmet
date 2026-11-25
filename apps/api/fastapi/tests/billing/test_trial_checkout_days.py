"""ADR-0066 item 5: a self-created business's trial ends at a stored time.

A Checkout started during the trial passes only the whole days left to Stripe, none
when less than a day is left. A grant without ``trial_ends_at`` (Babydoll's seed) keeps
its fixed ``trial_days``.
"""

from collections.abc import AsyncGenerator
from datetime import timedelta

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.billing import app_subscriptions
from src.billing.models import Plan
from src.utils.datetime import utc_now
from tests.organisations.support import make_org

PLAN = "bookings-monthly"


@pytest.fixture(autouse=True)
async def plan_seed(db_async: AsyncSession) -> AsyncGenerator[None]:
    """The migration seeds the plan; the test database is cleared per test, so seed here."""
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


async def test_checkout_passes_only_the_whole_days_left_of_the_trial(
    db_async: AsyncSession,
) -> None:
    org = await make_org(db_async, "Trial Days Salon")
    await app_subscriptions.grant_trial(
        db_async,
        organisation_id=org.id,
        plan_key=PLAN,
        trial_days=30,
        trial_ends_at=utc_now() + timedelta(days=10, hours=5),
    )
    days = await app_subscriptions._trial_days(
        db_async, organisation_id=org.id, plan_key=PLAN
    )
    assert days == 10


async def test_under_a_day_left_means_no_trial(db_async: AsyncSession) -> None:
    org = await make_org(db_async, "Short Trial Salon")
    await app_subscriptions.grant_trial(
        db_async,
        organisation_id=org.id,
        plan_key=PLAN,
        trial_days=30,
        trial_ends_at=utc_now() + timedelta(hours=23),
    )
    assert (
        await app_subscriptions._trial_days(
            db_async, organisation_id=org.id, plan_key=PLAN
        )
        is None
    )


async def test_an_expired_trial_means_no_trial(db_async: AsyncSession) -> None:
    org = await make_org(db_async, "Expired Trial Salon")
    await app_subscriptions.grant_trial(
        db_async,
        organisation_id=org.id,
        plan_key=PLAN,
        trial_days=30,
        trial_ends_at=utc_now() - timedelta(days=1),
    )
    assert (
        await app_subscriptions._trial_days(
            db_async, organisation_id=org.id, plan_key=PLAN
        )
        is None
    )


async def test_a_grant_without_an_end_keeps_its_fixed_days(
    db_async: AsyncSession,
) -> None:
    org = await make_org(db_async, "Fixed Trial Client")
    await app_subscriptions.grant_trial(
        db_async, organisation_id=org.id, plan_key=PLAN, trial_days=30
    )
    assert (
        await app_subscriptions._trial_days(
            db_async, organisation_id=org.id, plan_key=PLAN
        )
        == 30
    )
