"""Where an entitlement came from (ADR-0066 slice 1).

Every write to ``org.organisation_app`` says why access was given. Staff grants and
switch-offs are ``manual``, which also opts a business out of any later subscription
switch. A bundled product (Bookings brings Contacts) takes the same source.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.organisations import service
from src.organisations.models import (
    EntitlementSource,
    OrganisationApp,
    PlatformOrganisation,
)
from tests.factories import make_user
from tests.organisations.support import make_org


async def _source(db: AsyncSession, org_id: str, key: str) -> tuple[bool, str]:
    db.expire_all()
    row = await db.get(OrganisationApp, (org_id, key))
    assert row is not None
    return row.enabled, row.source


async def test_a_staff_grant_is_recorded_as_manual(db_async: AsyncSession) -> None:
    org = await make_org(db_async, "Manual Grant Ltd")
    await service.set_app_enabled(
        db_async, organisation_id=org.id, app_key="bookings", enabled=True
    )
    await db_async.commit()

    assert await _source(db_async, org.id, "bookings") == (True, "manual")


async def test_switching_access_off_is_manual_too(db_async: AsyncSession) -> None:
    org = await make_org(db_async, "Switch Off Ltd")
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
    await db_async.commit()

    assert await _source(db_async, org.id, "bookings") == (False, "manual")


async def test_a_bundled_product_takes_the_same_source(db_async: AsyncSession) -> None:
    org_id = (await make_org(db_async, "Bundled Trial Ltd")).id
    await service.set_app_enabled(
        db_async,
        organisation_id=org_id,
        app_key="bookings",
        enabled=True,
        source=EntitlementSource.TRIAL,
    )
    await db_async.commit()

    assert await _source(db_async, org_id, "bookings") == (True, "trial")
    assert await _source(db_async, org_id, "contacts") == (True, "trial")


async def test_the_admin_switch_records_manual(db_async: AsyncSession) -> None:
    actor_id = (await make_user(db_async, superuser=True)).id
    org_id = (await make_org(db_async, "Admin Switch Ltd")).id
    actor = await db_async.get(User, actor_id)
    assert actor is not None
    await service.admin_set_app(db_async, actor, org_id, "bookings", enabled=True)
    await db_async.commit()

    assert await _source(db_async, org_id, "bookings") == (True, "manual")
    assert await _source(db_async, org_id, "contacts") == (True, "manual")


async def test_a_new_organisation_has_no_creator(db_async: AsyncSession) -> None:
    org = await make_org(db_async, "Staff Made Ltd")

    organisation = await db_async.get(PlatformOrganisation, org.id)
    assert organisation is not None
    assert organisation.created_by_user_id is None
