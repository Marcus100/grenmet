"""Organiser logo and listing image (F8): stored file ids, checked against uploads."""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.events.models import Activity, Organiser
from src.organisations.models import MembershipRole, PlatformOrganisation
from src.storage.models import OrgUpload
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import BASE, SessionFactory, client_with_real_roles
from tests.events.test_organiser_admin import _organiser, _payload
from tests.organisations.support import make_org

MANAGE = f"{BASE}/manage"


async def _upload(
    db: AsyncSession,
    organisation: PlatformOrganisation,
    *,
    purpose: str,
    status: str = "complete",
) -> uuid.UUID:
    upload_id = uuid.uuid4()
    now = utc_now()
    db.add(
        OrgUpload(
            id=upload_id,
            organisation_id=organisation.id,
            app="events",
            purpose=purpose,
            object_key=f"org/{organisation.id}/events/{purpose}/{upload_id}.png",
            content_type="image/png",
            size_bytes=100,
            status=status,
            created_at=now,
            expires_at=now,
        )
    )
    await db.commit()
    return upload_id


async def _setup(events_db: SessionFactory, db_async: AsyncSession):
    user = await user_with_role(db_async, "events-organiser")
    mine = await make_org(
        db_async, "Crew", members=((user, MembershipRole.ADMIN),), apps=("events",)
    )
    # Only verified organisers can publish (E1 gate); listings here go live.
    mine.verified_at = utc_now()
    await db_async.commit()
    other = await make_org(db_async, "Rivals")
    async with events_db() as db:
        db.add(Organiser(slug="crew", name="Crew", organisation_id=mine.id))
        await db.commit()
    return user, mine, other


@pytest.mark.asyncio
async def test_listing_image_round_trips_and_is_optional(
    events_db: SessionFactory, db_async: AsyncSession
):
    user, mine, _ = await _setup(events_db, db_async)
    image = await _upload(db_async, mine, purpose="listing-image")
    async with client_with_real_roles(user) as client:
        plain = await client.post(f"{MANAGE}/listings", json=_payload())
        assert plain.status_code == 201
        assert plain.json()["image_file_id"] is None
        listing_id = plain.json()["id"]

        # Saving an existing listing without the field keeps working.
        again = await client.put(f"{MANAGE}/listings/{listing_id}", json=_payload())
        assert again.status_code == 200

        with_image = await client.put(
            f"{MANAGE}/listings/{listing_id}",
            json=_payload(image_file_id=str(image)),
        )
        assert with_image.status_code == 200, with_image.text
        assert with_image.json()["image_file_id"] == str(image)
        public = await client.get(f"{BASE}/listings/{with_image.json()['slug']}")
        assert public.json()["image_file_id"] == str(image)

        cleared = await client.put(
            f"{MANAGE}/listings/{listing_id}", json=_payload(image_file_id=None)
        )
        assert cleared.json()["image_file_id"] is None


@pytest.mark.asyncio
async def test_listing_image_must_be_a_complete_upload_of_this_organisation(
    events_db: SessionFactory, db_async: AsyncSession
):
    user, mine, other = await _setup(events_db, db_async)
    foreign = await _upload(db_async, other, purpose="listing-image")
    pending = await _upload(db_async, mine, purpose="listing-image", status="pending")
    wrong_purpose = await _upload(db_async, mine, purpose="organiser-logo")
    async with client_with_real_roles(user) as client:
        for file_id in (foreign, pending, wrong_purpose, uuid.uuid4()):
            response = await client.post(
                f"{MANAGE}/listings", json=_payload(image_file_id=str(file_id))
            )
            assert response.status_code == 409, file_id
            assert "not available" in response.text


@pytest.mark.asyncio
async def test_logo_set_clear_and_record_history(
    events_db: SessionFactory, db_async: AsyncSession
):
    user, mine, other = await _setup(events_db, db_async)
    logo = await _upload(db_async, mine, purpose="organiser-logo")
    foreign = await _upload(db_async, other, purpose="organiser-logo")
    async with client_with_real_roles(user) as client:
        assert (await client.get(MANAGE)).json()["logo_file_id"] is None
        denied = await client.put(
            f"{MANAGE}/organiser/logo", json={"file_id": str(foreign)}
        )
        assert denied.status_code == 409
        ok = await client.put(f"{MANAGE}/organiser/logo", json={"file_id": str(logo)})
        assert ok.status_code == 200, ok.text
        assert ok.json()["logo_file_id"] == str(logo)
        assert (await client.get(MANAGE)).json()["logo_file_id"] == str(logo)
        # Repeating is a no-op; clearing is allowed.
        assert (
            await client.put(f"{MANAGE}/organiser/logo", json={"file_id": str(logo)})
        ).status_code == 200
        cleared = await client.put(f"{MANAGE}/organiser/logo", json={"file_id": None})
        assert cleared.json()["logo_file_id"] is None
    async with events_db() as db:
        actions = [row.action for row in (await db.scalars(select(Activity))).all()]
    assert actions.count("organiser.logo_changed") == 2


@pytest.mark.asyncio
async def test_unlinked_organiser_cannot_store_images(
    events_db: SessionFactory, db_async: AsyncSession
):
    user = await _organiser(events_db, db_async)
    async with client_with_real_roles(user) as client:
        response = await client.put(
            f"{MANAGE}/organiser/logo", json={"file_id": str(uuid.uuid4())}
        )
        assert response.status_code == 409
        assert "organisation" in response.text
