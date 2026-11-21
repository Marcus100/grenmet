"""Organiser profile edit: an approved organiser's owner or admin changes name and bio.

The slug is fixed, the approval stays and every real change is logged once in the
activity table (the audit row for this route)."""

import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.events.models import Activity, Organiser
from src.organisations.models import MembershipRole, PlatformOrganisation
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import BASE, SessionFactory, client_with_real_roles
from tests.organisations.support import make_org

PROFILE = f"{BASE}/manage/organiser"
ACTION = "organiser.profile_updated"


async def _setup(
    events_db: SessionFactory,
    db_async: AsyncSession,
    *,
    name: str = "Crew",
    slug: str = "crew",
    approved: bool = True,
    role: MembershipRole = MembershipRole.OWNER,
):
    """A user with ``role`` in a platform organisation backing organiser ``slug``."""
    user = await user_with_role(db_async, "events-organiser")
    organisation = await make_org(
        db_async,
        f"{name} org {uuid.uuid4().hex[:6]}",
        members=((user, role),),
        apps=("events",),
    )
    if approved:
        organisation.verified_at = utc_now()
    await db_async.commit()
    async with events_db() as db:
        db.add(
            Organiser(
                slug=slug, name=name, bio="Old bio", organisation_id=organisation.id
            )
        )
        await db.commit()
    return user, organisation


async def _organiser(events_db: SessionFactory, slug: str = "crew") -> Organiser:
    async with events_db() as db:
        row = await db.scalar(select(Organiser).where(Organiser.slug == slug))
        assert row is not None
        db.expunge(row)
        return row


async def _profile_activity(events_db: SessionFactory) -> list[Activity]:
    async with events_db() as db:
        rows = (
            await db.scalars(select(Activity).where(Activity.action == ACTION))
        ).all()
        for row in rows:
            db.expunge(row)
        return list(rows)


async def _verified_at(db_async: AsyncSession, organisation_id: str | None):
    row = await db_async.scalar(
        select(PlatformOrganisation).where(PlatformOrganisation.id == organisation_id)
    )
    assert row is not None
    return row.verified_at


@pytest.mark.asyncio
async def test_owner_edits_name_and_bio_and_keeps_slug_and_approval(
    events_db: SessionFactory, db_async: AsyncSession
):
    owner, organisation = await _setup(events_db, db_async)
    async with client_with_real_roles(owner) as client:
        resp = await client.patch(
            PROFILE, json={"name": "  Crew Two  ", "bio": "We run the harbour walks."}
        )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Crew Two"
    assert body["bio"] == "We run the harbour walks."
    assert body["slug"] == "crew"
    assert body["verified"] is True

    stored = await _organiser(events_db)
    assert (stored.name, stored.bio, stored.slug) == (
        "Crew Two",
        "We run the harbour walks.",
        "crew",
    )
    assert await _verified_at(db_async, organisation.id) is not None

    rows = await _profile_activity(events_db)
    assert len(rows) == 1
    assert rows[0].actor_id == owner.id
    assert rows[0].organiser_id == stored.id
    assert rows[0].summary == {"changed": ["bio", "name"]}


@pytest.mark.asyncio
async def test_a_partial_edit_leaves_the_other_field_alone(
    events_db: SessionFactory, db_async: AsyncSession
):
    owner, _ = await _setup(events_db, db_async)
    async with client_with_real_roles(owner) as client:
        resp = await client.patch(PROFILE, json={"bio": "Only the bio changes."})
    assert resp.status_code == 200, resp.text
    assert resp.json()["name"] == "Crew"
    stored = await _organiser(events_db)
    assert (stored.name, stored.bio) == ("Crew", "Only the bio changes.")
    rows = await _profile_activity(events_db)
    assert [row.summary for row in rows] == [{"changed": ["bio"]}]


@pytest.mark.asyncio
async def test_an_admin_may_edit_the_profile(
    events_db: SessionFactory, db_async: AsyncSession
):
    admin, _ = await _setup(events_db, db_async, role=MembershipRole.ADMIN)
    async with client_with_real_roles(admin) as client:
        resp = await client.patch(PROFILE, json={"name": "Crew Admin"})
    assert resp.status_code == 200, resp.text
    assert (await _organiser(events_db)).name == "Crew Admin"


@pytest.mark.asyncio
async def test_a_plain_member_and_a_stranger_are_refused(
    events_db: SessionFactory, db_async: AsyncSession
):
    plain, _ = await _setup(events_db, db_async, role=MembershipRole.MEMBER)
    async with client_with_real_roles(plain) as client:
        assert (
            await client.patch(PROFILE, json={"name": "Hijacked"})
        ).status_code == 403

    stranger, _ = await _setup(events_db, db_async, slug="other-crew", name="Other")
    async with client_with_real_roles(stranger) as client:
        # Acts only for organisers it manages: the owner of "other-crew" cannot
        # reach "crew" by slug either.
        resp = await client.patch(
            f"{PROFILE}?organiser=crew", json={"name": "Hijacked"}
        )
        assert resp.status_code == 403, resp.text

    stored = await _organiser(events_db)
    assert stored.name == "Crew"
    assert await _profile_activity(events_db) == []


@pytest.mark.asyncio
async def test_an_unapproved_organiser_cannot_edit_its_profile(
    events_db: SessionFactory, db_async: AsyncSession
):
    owner, _ = await _setup(events_db, db_async, approved=False)
    async with client_with_real_roles(owner) as client:
        resp = await client.patch(PROFILE, json={"name": "Too Early"})
    assert resp.status_code == 403, resp.text
    assert (await _organiser(events_db)).name == "Crew"
    assert await _profile_activity(events_db) == []


@pytest.mark.asyncio
async def test_the_slug_cannot_be_changed(
    events_db: SessionFactory, db_async: AsyncSession
):
    owner, _ = await _setup(events_db, db_async)
    async with client_with_real_roles(owner) as client:
        refused = await client.patch(PROFILE, json={"name": "Crew", "slug": "new-slug"})
    assert refused.status_code == 422, refused.text
    stored = await _organiser(events_db)
    assert stored.slug == "crew"
    assert await _profile_activity(events_db) == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "payload",
    [
        {"name": "A"},
        {"name": "   "},
        {"name": "x" * 81},
        {"name": None},
        {"name": 42},
        {"bio": "x" * 501},
        {"bio": None},
    ],
)
async def test_invalid_profile_values_are_rejected(
    events_db: SessionFactory,
    db_async: AsyncSession,
    payload: dict[str, object],
):
    owner, _ = await _setup(events_db, db_async)
    async with client_with_real_roles(owner) as client:
        resp = await client.patch(PROFILE, json=payload)
    assert resp.status_code == 422, resp.text
    stored = await _organiser(events_db)
    assert (stored.name, stored.bio) == ("Crew", "Old bio")
    assert await _profile_activity(events_db) == []


@pytest.mark.asyncio
async def test_a_name_at_the_limits_is_accepted(
    events_db: SessionFactory, db_async: AsyncSession
):
    owner, _ = await _setup(events_db, db_async)
    async with client_with_real_roles(owner) as client:
        short = await client.patch(PROFILE, json={"name": "Ab"})
        longest = await client.patch(PROFILE, json={"name": "x" * 80, "bio": "y" * 500})
    assert short.status_code == 200, short.text
    assert longest.status_code == 200, longest.text


@pytest.mark.asyncio
async def test_saving_unchanged_values_writes_no_activity(
    events_db: SessionFactory, db_async: AsyncSession
):
    owner, _ = await _setup(events_db, db_async)
    async with client_with_real_roles(owner) as client:
        resp = await client.patch(PROFILE, json={"name": "Crew", "bio": "Old bio"})
        empty = await client.patch(PROFILE, json={})
    assert resp.status_code == 200, resp.text
    assert empty.status_code == 200, empty.text
    assert await _profile_activity(events_db) == []


@pytest.mark.asyncio
async def test_several_organisers_need_an_explicit_choice(
    events_db: SessionFactory, db_async: AsyncSession
):
    owner, _ = await _setup(events_db, db_async)
    second = await make_org(
        db_async,
        f"Second org {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER),),
        apps=("events",),
    )
    second.verified_at = utc_now()
    await db_async.commit()
    async with events_db() as db:
        db.add(Organiser(slug="second", name="Second", organisation_id=second.id))
        await db.commit()

    async with client_with_real_roles(owner) as client:
        ambiguous = await client.patch(PROFILE, json={"name": "Guess"})
        assert ambiguous.status_code == 422, ambiguous.text
        chosen = await client.patch(
            f"{PROFILE}?organiser=second", json={"name": "Second Renamed"}
        )
    assert chosen.status_code == 200, chosen.text
    assert chosen.json()["slug"] == "second"
    assert (await _organiser(events_db, "second")).name == "Second Renamed"
    assert (await _organiser(events_db)).name == "Crew"


@pytest.mark.asyncio
async def test_the_bio_is_trimmed_so_spaces_are_no_change(
    events_db: SessionFactory, db_async: AsyncSession
):
    owner, _ = await _setup(events_db, db_async)
    async with client_with_real_roles(owner) as client:
        same = await client.patch(PROFILE, json={"bio": "  Old bio  "})
        blank = await client.patch(PROFILE, json={"bio": "   "})
    assert same.status_code == 200, same.text
    assert blank.status_code == 200, blank.text
    stored = await _organiser(events_db)
    assert stored.bio == ""
    rows = await _profile_activity(events_db)
    assert [row.summary for row in rows] == [{"changed": ["bio"]}]
