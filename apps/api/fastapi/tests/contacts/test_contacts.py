"""Organisation contacts (PF3): service rules, routes, isolation and audit."""

import uuid

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import User
from src.contacts import service
from src.contacts.exceptions import ContactErasedError, ContactMergeError
from src.contacts.models import ConsentPurpose, Contact, ContactConsent
from src.organisations.models import MembershipRole
from src.utils.email_hash import hash_email
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/contacts"


def _email() -> str:
    return f"person-{uuid.uuid4().hex[:8]}@example.com"


async def _org(
    db: AsyncSession, *, apps: tuple[str, ...] = ("contacts",)
) -> tuple[User, User, str]:
    owner = await make_user(db)
    member = await make_user(db)
    org = await make_org(
        db,
        f"Shop {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
        apps=apps,
    )
    return owner, member, org.id


async def _consent_count(db: AsyncSession, contact_id: str) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(ContactConsent)
            .where(ContactConsent.contact_id == contact_id)
        )
        or 0
    )


# --- service ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_upsert_matches_exact_email_hash_only(db_async: AsyncSession) -> None:
    _, _, org_id = await _org(db_async)
    email = _email()
    first = await service.upsert_contact(
        db_async, org_id, email=email, name="Ada", source="bookings"
    )
    again = await service.upsert_contact(
        db_async,
        org_id,
        email=f"  {email.upper()} ",
        name="Other",
        phone="473-555-0100",
        source="billing",
    )
    assert again.id == first.id
    assert again.name == "Ada"  # curated name kept
    assert again.phone == "473-555-0100"  # blank filled
    assert again.source == "bookings"
    assert first.id.startswith("con_")
    assert first.email_hash == hash_email(email)

    # Same name, different address: a separate person, never merged.
    other = await service.upsert_contact(
        db_async, org_id, email=_email(), name="Ada", source="bookings"
    )
    assert other.id != first.id


@pytest.mark.asyncio
async def test_same_email_in_two_organisations_is_two_contacts(
    db_async: AsyncSession,
) -> None:
    _, _, org_a = await _org(db_async)
    _, _, org_b = await _org(db_async)
    email = _email()
    a = await service.upsert_contact(db_async, org_a, email=email, source="manual")
    b = await service.upsert_contact(db_async, org_b, email=email, source="manual")
    assert a.id != b.id
    assert await service.find_by_email(db_async, org_a, email) == a
    assert await service.find_by_email(db_async, org_b, email) == b
    with pytest.raises(Exception, match="not found"):
        await service.get_contact(db_async, org_b, a.id)


@pytest.mark.asyncio
async def test_consent_history_is_append_only(db_async: AsyncSession) -> None:
    _, _, org_id = await _org(db_async)
    contact = await service.upsert_contact(
        db_async,
        org_id,
        email=_email(),
        source="subscriptions",
        consents={ConsentPurpose.MARKETING: True},
    )
    first = (await service.consent_history(db_async, contact.id))[0]
    first_snapshot = (first.id, first.granted, first.granted_at, first.revoked_at)

    # An unchanged decision adds no history row.
    await service.upsert_contact(
        db_async,
        org_id,
        email=contact.email or "",
        source="bookings",
        consents={ConsentPurpose.MARKETING: True},
    )
    assert await _consent_count(db_async, contact.id) == 1

    await service.set_consent(
        db_async, contact, ConsentPurpose.MARKETING, False, source="unsubscribe"
    )
    await service.set_consent(
        db_async, contact, ConsentPurpose.MARKETING, True, source="manual"
    )
    history = await service.consent_history(db_async, contact.id)
    assert [h.granted for h in history] == [True, False, True]
    assert (
        history[0].id,
        history[0].granted,
        history[0].granted_at,
        history[0].revoked_at,
    ) == first_snapshot
    assert history[1].revoked_at is not None
    assert history[1].granted_at is None
    current = await service.current_consents(db_async, contact.id)
    assert current[ConsentPurpose.MARKETING].granted is True
    assert ConsentPurpose.ANALYTICS not in current


@pytest.mark.asyncio
async def test_merge_moves_consents_and_audits(db_async: AsyncSession) -> None:
    owner, _, org_id = await _org(db_async)
    keep = await service.upsert_contact(
        db_async, org_id, email=_email(), source="bookings"
    )
    drop = await service.upsert_contact(
        db_async,
        org_id,
        email=_email(),
        name="Grace",
        phone="473-555-0111",
        source="billing",
        consents={ConsentPurpose.SERVICE: True},
    )
    earlier = drop.created_at.replace(year=drop.created_at.year - 1)
    drop.created_at = earlier
    drop_id = drop.id
    await db_async.flush()

    merged = await service.merge_contacts(
        db_async, owner, keep.id, drop_id, organisation_id=org_id
    )
    assert merged.id == keep.id
    assert merged.created_at == earlier
    assert merged.name == "Grace"
    assert await db_async.get(Contact, drop_id) is None
    current = await service.current_consents(db_async, keep.id)
    assert current[ConsentPurpose.SERVICE].granted is True

    entry = await db_async.scalar(
        select(AuditEntry).where(
            AuditEntry.record_id == keep.id, AuditEntry.action == "merge"
        )
    )
    assert entry is not None
    assert entry.actor_user_id == owner.id
    assert entry.entity_type == "platform_organisation"
    assert entry.entity_id == org_id
    assert entry.changes[0]["new"] == drop_id

    with pytest.raises(ContactMergeError):
        await service.merge_contacts(
            db_async, owner, keep.id, keep.id, organisation_id=org_id
        )


@pytest.mark.asyncio
async def test_merge_gives_an_addressless_contact_the_other_address(
    db_async: AsyncSession,
) -> None:
    owner, _, org_id = await _org(db_async)
    walk_in = await service.create_without_email(
        db_async, org_id, name="Walk In", source="bookings"
    )
    email = _email()
    emailed = await service.upsert_contact(
        db_async, org_id, email=email, source="billing"
    )
    walk_in_id, emailed_id = walk_in.id, emailed.id
    merged = await service.merge_contacts(
        db_async, owner, walk_in_id, emailed_id, organisation_id=org_id
    )
    assert merged.id == walk_in_id
    assert merged.email == email.strip()
    assert merged.name == "Walk In"
    found = await service.find_by_email(db_async, org_id, email)
    assert found is not None and found.id == walk_in_id


@pytest.mark.asyncio
async def test_merge_across_organisations_is_refused(db_async: AsyncSession) -> None:
    owner, _, org_a = await _org(db_async)
    _, _, org_b = await _org(db_async)
    keep = await service.upsert_contact(db_async, org_a, email=_email(), source="x")
    foreign = await service.upsert_contact(db_async, org_b, email=_email(), source="x")
    with pytest.raises(Exception, match="not found"):
        await service.merge_contacts(
            db_async, owner, keep.id, foreign.id, organisation_id=org_a
        )
    assert await db_async.get(Contact, foreign.id) is not None


@pytest.mark.asyncio
async def test_erase_blanks_details_keeps_tombstone_and_revokes(
    db_async: AsyncSession,
) -> None:
    owner, _, org_id = await _org(db_async)
    email = _email()
    contact = await service.upsert_contact(
        db_async,
        org_id,
        email=email,
        name="Grace",
        phone="473-555-0111",
        source="bookings",
        consents={ConsentPurpose.MARKETING: True, ConsentPurpose.SERVICE: False},
    )
    await service.erase_contact(db_async, contact, actor=owner)
    assert (contact.email, contact.name, contact.phone, contact.user_id) == (
        None,
        None,
        None,
        None,
    )
    assert contact.erased_at is not None
    assert contact.email_hash == hash_email(email)
    current = await service.current_consents(db_async, contact.id)
    assert not any(c.granted for c in current.values())
    assert current[ConsentPurpose.MARKETING].source == service.ERASURE_SOURCE
    with pytest.raises(ContactErasedError):
        await service.set_consent(
            db_async, contact, ConsentPurpose.MARKETING, True, source="x"
        )

    actions = set(
        await db_async.scalars(
            select(AuditEntry.action).where(AuditEntry.record_id == contact.id)
        )
    )
    assert {"create", "erase"} <= actions
    # No personal data in any audit row for this contact.
    entries = await db_async.scalars(
        select(AuditEntry).where(AuditEntry.record_id == contact.id)
    )
    assert "Grace" not in str([e.changes for e in entries])

    # The same person returning is revived without their old consent.
    back = await service.upsert_contact(db_async, org_id, email=email, source="manual")
    assert back.id == contact.id
    assert back.erased_at is None
    assert back.name is None


# --- routes ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_routes_roles_search_and_pagination(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, member, org_id = await _org(db_async)
    admin_h = headers_for(owner, org_id)
    member_h = headers_for(member, org_id)
    email = _email()

    created = await async_client.post(
        f"{API}/org/contacts",
        headers=admin_h,
        json={"email": email, "name": "Ada Lovelace"},
    )
    assert created.status_code == 200, created.text
    contact_id = created.json()["id"]
    assert "email_hash" not in created.json()
    for index in range(2):
        await async_client.post(
            f"{API}/org/contacts",
            headers=admin_h,
            json={"email": _email(), "name": f"Filler {index}"},
        )

    denied = await async_client.post(
        f"{API}/org/contacts", headers=member_h, json={"email": _email()}
    )
    assert denied.status_code == 403

    listed = await async_client.get(
        f"{API}/org/contacts", headers=member_h, params={"size": 2}
    )
    assert listed.status_code == 200
    body = listed.json()
    assert (body["count"], len(body["data"]), body["total_pages"]) == (3, 2, 2)

    by_name = await async_client.get(
        f"{API}/org/contacts", headers=member_h, params={"q": "lovelace"}
    )
    assert [c["id"] for c in by_name.json()["data"]] == [contact_id]
    by_email = await async_client.get(
        f"{API}/org/contacts", headers=member_h, params={"q": email.upper()}
    )
    assert [c["id"] for c in by_email.json()["data"]] == [contact_id]
    wildcard = await async_client.get(
        f"{API}/org/contacts", headers=member_h, params={"q": "%"}
    )
    assert wildcard.json()["count"] == 0

    patched = await async_client.patch(
        f"{API}/org/contacts/{contact_id}",
        headers=admin_h,
        json={"phone": "473-555-0100"},
    )
    assert patched.status_code == 200
    assert patched.json()["phone"] == "473-555-0100"
    assert patched.json()["name"] == "Ada Lovelace"
    assert (
        await async_client.patch(
            f"{API}/org/contacts/{contact_id}", headers=member_h, json={"name": "x"}
        )
    ).status_code == 403

    consent = await async_client.post(
        f"{API}/org/contacts/{contact_id}/consents",
        headers=admin_h,
        json={"purpose": "marketing", "granted": True},
    )
    assert consent.status_code == 201
    await async_client.post(
        f"{API}/org/contacts/{contact_id}/consents",
        headers=admin_h,
        json={"purpose": "marketing", "granted": False, "source": "unsubscribe"},
    )
    consents = await async_client.get(
        f"{API}/org/contacts/{contact_id}/consents", headers=member_h
    )
    body = consents.json()
    assert len(body["history"]) == 2
    assert [c["granted"] for c in body["current"]] == [False]
    detail = await async_client.get(
        f"{API}/org/contacts/{contact_id}", headers=member_h
    )
    assert detail.json()["consents"][0]["granted"] is False


@pytest.mark.asyncio
async def test_merge_and_erase_routes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, member, org_id = await _org(db_async)
    admin_h = headers_for(owner, org_id)
    first = (
        await async_client.post(
            f"{API}/org/contacts", headers=admin_h, json={"email": _email()}
        )
    ).json()["id"]
    second = (
        await async_client.post(
            f"{API}/org/contacts",
            headers=admin_h,
            json={"email": _email(), "name": "Grace"},
        )
    ).json()["id"]

    forbidden = await async_client.post(
        f"{API}/org/contacts/{first}/merge",
        headers=headers_for(member, org_id),
        json={"drop_contact_id": second},
    )
    assert forbidden.status_code == 403
    self_merge = await async_client.post(
        f"{API}/org/contacts/{first}/merge",
        headers=admin_h,
        json={"drop_contact_id": first},
    )
    assert self_merge.status_code == 409
    merged = await async_client.post(
        f"{API}/org/contacts/{first}/merge",
        headers=admin_h,
        json={"drop_contact_id": second},
    )
    assert merged.status_code == 200, merged.text
    assert merged.json()["name"] == "Grace"
    assert (
        await async_client.get(f"{API}/org/contacts/{second}", headers=admin_h)
    ).status_code == 404

    assert (
        await async_client.post(
            f"{API}/org/contacts/{first}/erase", headers=headers_for(member, org_id)
        )
    ).status_code == 403
    erased = await async_client.post(
        f"{API}/org/contacts/{first}/erase", headers=admin_h
    )
    assert erased.status_code == 200
    body = erased.json()
    assert body["email"] is None and body["name"] is None
    assert body["erased_at"] is not None
    hidden = await async_client.get(f"{API}/org/contacts", headers=admin_h)
    assert hidden.json()["count"] == 0
    shown = await async_client.get(
        f"{API}/org/contacts", headers=admin_h, params={"include_erased": True}
    )
    assert shown.json()["count"] == 1
    assert (
        await async_client.patch(
            f"{API}/org/contacts/{first}", headers=admin_h, json={"name": "x"}
        )
    ).status_code == 409


@pytest.mark.asyncio
async def test_cross_organisation_denial(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner_a, _, org_a = await _org(db_async)
    owner_b, _, org_b = await _org(db_async)
    email = _email()
    in_a = (
        await async_client.post(
            f"{API}/org/contacts",
            headers=headers_for(owner_a, org_a),
            json={"email": email},
        )
    ).json()["id"]
    in_b = (
        await async_client.post(
            f"{API}/org/contacts",
            headers=headers_for(owner_b, org_b),
            json={"email": email},
        )
    ).json()["id"]
    assert in_a != in_b

    # B's owner cannot read, change, merge or erase A's contact via B's header...
    b_headers = headers_for(owner_b, org_b)
    for method, suffix, payload in (
        ("GET", "", None),
        ("PATCH", "", {"name": "x"}),
        ("POST", "/erase", None),
        ("POST", "/merge", {"drop_contact_id": in_b}),
    ):
        response = await async_client.request(
            method,
            f"{API}/org/contacts/{in_a}{suffix}",
            headers=b_headers,
            json=payload,
        )
        assert response.status_code == 404, (method, suffix)
    # ...or by claiming A's organisation (not a member there).
    claim = await async_client.get(
        f"{API}/org/contacts/{in_a}", headers=headers_for(owner_b, org_a)
    )
    assert claim.status_code == 404
    assert (
        await async_client.get(
            f"{API}/org/contacts", headers=headers_for(owner_b, org_a)
        )
    ).status_code == 404
    listing = await async_client.get(f"{API}/org/contacts", headers=b_headers)
    assert [c["id"] for c in listing.json()["data"]] == [in_b]


@pytest.mark.asyncio
async def test_entitlement_required(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, _, org_id = await _org(db_async, apps=())
    response = await async_client.get(
        f"{API}/org/contacts", headers=headers_for(owner, org_id)
    )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_admin_list_is_superuser_only(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    owner, _, org_id = await _org(db_async)
    await async_client.post(
        f"{API}/org/contacts",
        headers=headers_for(owner, org_id),
        json={"email": _email()},
    )
    assert (
        await async_client.get(
            f"{API}/admin/contacts", headers=headers_for(owner, org_id)
        )
    ).status_code == 403
    ok = await async_client.get(
        f"{API}/admin/contacts",
        headers=superuser_token_headers_async,
        params={"organisation_id": org_id},
    )
    assert ok.status_code == 200
    assert ok.json()["count"] == 1
