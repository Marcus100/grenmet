"""Organisers created or linked after the backfill get the ``events`` product."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.events import service
from src.events.service import organiser_admin
from src.organisations import service as org_service
from src.organisations.models import OrganisationApp, OrganisationKind
from tests.events.roles import user_with_role
from tests.events.support import (
    BASE,
    SessionFactory,
    client_with_real_roles,
)
from tests.events.test_paid_orders import make_user


async def _events_row(db: AsyncSession, organisation_id: str) -> OrganisationApp | None:
    return await db.scalar(
        select(OrganisationApp)
        .where(
            OrganisationApp.organisation_id == organisation_id,
            OrganisationApp.app_key == "events",
        )
        .execution_options(populate_existing=True)
    )


@pytest.mark.asyncio
async def test_create_organiser_enables_events(
    events_db: SessionFactory, db_async: AsyncSession
):
    _ = events_db
    user = await make_user(db_async)
    organiser = await service.create_organiser(db_async, user, name="Wave Makers")
    assert organiser.organisation_id is not None
    row = await _events_row(db_async, organiser.organisation_id)
    assert row is not None and row.enabled is True


@pytest.mark.asyncio
async def test_request_organiser_enables_events(
    events_db: SessionFactory, db_async: AsyncSession
):
    _ = events_db
    member = await user_with_role(db_async, None)
    async with client_with_real_roles(member) as client:
        response = await client.post(f"{BASE}/manage/organiser", json={"name": "Reef"})
    assert response.status_code == 201, response.text
    row = await _events_row(db_async, response.json()["organisation_id"])
    assert row is not None and row.enabled is True


@pytest.mark.asyncio
async def test_linking_adds_a_missing_row_and_keeps_a_staff_disable(
    events_db: SessionFactory, db_async: AsyncSession
):
    _ = events_db
    user = await make_user(db_async)
    fresh = await org_service.create_organisation(
        db_async, name="Fresh Co", kind=OrganisationKind.BUSINESS
    )
    off = await org_service.create_organisation(
        db_async, name="Off Co", kind=OrganisationKind.BUSINESS
    )
    await org_service.set_app_enabled(
        db_async, organisation_id=off.id, app_key="events", enabled=False
    )
    await db_async.commit()
    for organisation_id in (fresh.id, off.id, fresh.id):  # twice is safe
        await organiser_admin.ensure_events_entitlement(db_async, user, organisation_id)
    await db_async.commit()
    fresh_row = await _events_row(db_async, fresh.id)
    off_row = await _events_row(db_async, off.id)
    assert fresh_row is not None and fresh_row.enabled is True
    assert off_row is not None and off_row.enabled is False
