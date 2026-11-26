"""Slice 2 follow-up (b): a staff grant does not downgrade a trial or subscription source.

A staff grant on a row that is already on keeps its source. A staff switch-off records
``manual`` (the opt-out), as before.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations import service
from src.organisations.models import EntitlementSource, OrganisationApp
from tests.organisations.support import make_org


async def _source(db: AsyncSession, org_id: str, key: str) -> tuple[bool, str]:
    db.expire_all()
    row = await db.get(OrganisationApp, (org_id, key))
    assert row is not None
    return row.enabled, row.source


async def test_a_staff_grant_keeps_a_trial_or_subscription_that_is_already_on(
    db_async: AsyncSession,
) -> None:
    for source in (EntitlementSource.TRIAL, EntitlementSource.SUBSCRIPTION):
        org = await make_org(db_async, f"Keep {source.value} Ltd")
        await service.set_app_enabled(
            db_async,
            organisation_id=org.id,
            app_key="bookings",
            enabled=True,
            source=source,
        )
        await service.set_app_enabled(
            db_async, organisation_id=org.id, app_key="bookings", enabled=True
        )
        assert await _source(db_async, org.id, "bookings") == (True, source.value)


async def test_a_staff_switch_off_records_manual_even_for_a_trial(
    db_async: AsyncSession,
) -> None:
    org = await make_org(db_async, "Switch Off Trial Ltd")
    await service.set_app_enabled(
        db_async,
        organisation_id=org.id,
        app_key="bookings",
        enabled=True,
        source=EntitlementSource.TRIAL,
    )
    await service.set_app_enabled(
        db_async, organisation_id=org.id, app_key="bookings", enabled=False
    )
    assert await _source(db_async, org.id, "bookings") == (False, "manual")
