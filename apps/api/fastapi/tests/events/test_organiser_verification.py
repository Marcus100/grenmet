"""A verified platform organisation shows its Events organiser as verified (C2)."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.events.models import Organiser
from src.organisations import verification
from tests.events.support import BASE, SessionFactory, client_with_real_roles
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

URL = "/api/v1/organisations"
DECISION = {"reason": "Checked registration papers"}


@pytest.fixture(autouse=True)
def _fresh_verification_cache() -> None:
    verification.clear_cache()


async def test_verified_organisation_makes_its_events_organiser_verified(
    events_db: SessionFactory, db_async: AsyncSession
):
    admin = await make_user(db_async, superuser=True)
    org = await make_org(db_async, "Verified Crew")
    async with events_db() as db:
        db.add(
            Organiser(
                slug="verified-crew", name="Verified Crew", organisation_id=org.id
            )
        )
        await db.commit()
    headers = headers_for(admin)
    async with client_with_real_roles(admin) as client:
        organiser = f"{BASE}/organisers/verified-crew"
        assert (await client.get(organiser)).json()["verified"] is False
        verify = await client.post(
            f"{URL}/{org.id}/verify", json=DECISION, headers=headers
        )
        assert verify.status_code == 200
        assert (await client.get(organiser)).json()["verified"] is True
        unverify = await client.post(
            f"{URL}/{org.id}/unverify", json=DECISION, headers=headers
        )
        assert unverify.status_code == 200
        assert (await client.get(organiser)).json()["verified"] is False


async def test_unlinked_organiser_keeps_its_own_flag(
    events_db: SessionFactory, db_async: AsyncSession
):
    admin = await make_user(db_async, superuser=True)
    async with events_db() as db:
        db.add(Organiser(slug="legacy-crew", name="Legacy Crew", verified=True))
        await db.commit()
    async with client_with_real_roles(admin) as client:
        response = await client.get(f"{BASE}/organisers/legacy-crew")
        assert response.json()["verified"] is True
