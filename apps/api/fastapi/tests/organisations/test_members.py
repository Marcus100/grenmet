"""Membership management (F4): invitations, roles, removal, last-owner, audit."""

from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.notifications.models import OutboundEmail
from src.organisations.members import hash_token
from src.organisations.models import (
    Invitation,
    Membership,
    MembershipRole,
    MembershipStatus,
    PlatformOrganisation,
)
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/organisations"


async def _token_for(db: AsyncSession, email: str) -> str:
    """The newest emailed link's token (the only place a token ever appears)."""
    rows = await db.scalars(
        select(OutboundEmail)
        .where(OutboundEmail.to_email == email.lower())
        .order_by(OutboundEmail.created_at.desc())
    )
    newest = rows.first()
    assert newest is not None
    link = newest.props["acceptLink"]
    return parse_qs(urlparse(link).query)["token"][0]


async def _invite(
    client: httpx.AsyncClient,
    actor,
    org: PlatformOrganisation,
    email: str,
    role: str = "member",
) -> httpx.Response:
    return await client.post(
        f"{API}/{org.id}/invitations",
        json={"email": email, "role": role},
        headers=headers_for(actor, org.id),
    )


async def _accept(client: httpx.AsyncClient, user, token: str) -> httpx.Response:
    return await client.post(
        f"{API}/invitations/accept", json={"token": token}, headers=headers_for(user)
    )


async def _membership(db: AsyncSession, org_id: str, user_id) -> Membership | None:
    result = await db.execute(
        select(Membership)
        .where(Membership.organisation_id == org_id, Membership.user_id == user_id)
        .execution_options(populate_existing=True)
    )
    return result.scalar_one_or_none()


# ── Invitation lifecycle ─────────────────────────────────────────────────────


async def test_invite_accept_creates_membership_and_spends_the_token(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    guest = await make_user(db_async, email="Guest.Person@Example.com")
    org = await make_org(
        db_async, "Invite Co", members=((owner, MembershipRole.OWNER),)
    )

    created = await _invite(async_client, owner, org, " GUEST.person@example.com ")
    assert created.status_code == 201
    body = created.json()
    assert body["email"] == "guest.person@example.com"
    assert body["role"] == "member"
    assert "token" not in body and "token_hash" not in body

    # Only the hash is stored; the plain token lives only in the emailed link.
    token = await _token_for(db_async, "guest.person@example.com")
    stored = await db_async.scalar(
        select(Invitation).where(Invitation.id == body["id"])
    )
    assert stored.token_hash == hash_token(token) != token
    mail = await db_async.scalar(
        select(OutboundEmail).where(
            OutboundEmail.to_email == "guest.person@example.com"
        )
    )
    assert mail.template == "organisation-invitation"
    assert mail.transactional is True
    assert mail.props["organisationName"] == "Invite Co"

    accepted = await _accept(async_client, guest, token)
    assert accepted.status_code == 200
    assert accepted.json()["role"] == "member"
    assert accepted.json()["organisation"]["id"] == org.id
    membership = await _membership(db_async, org.id, guest.id)
    assert membership.status == MembershipStatus.ACTIVE.value
    assert membership.invited_by_user_id == owner.id

    reuse = await _accept(async_client, guest, token)
    assert reuse.status_code == 400


async def test_expired_invitation_is_rejected(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    guest = await make_user(db_async)
    org = await make_org(
        db_async, "Expiry Co", members=((owner, MembershipRole.OWNER),)
    )
    await _invite(async_client, owner, org, guest.email)
    token = await _token_for(db_async, guest.email)
    invitation = await db_async.scalar(
        select(Invitation).where(Invitation.organisation_id == org.id)
    )
    invitation.expires_at = utc_now() - timedelta(minutes=1)
    await db_async.commit()

    assert (await _accept(async_client, guest, token)).status_code == 400
    assert await _membership(db_async, org.id, guest.id) is None


async def test_wrong_email_is_rejected_and_does_not_spend_the_token(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    guest = await make_user(db_async)
    stranger = await make_user(db_async)
    org = await make_org(
        db_async, "Mismatch Co", members=((owner, MembershipRole.OWNER),)
    )
    await _invite(async_client, owner, org, guest.email)
    token = await _token_for(db_async, guest.email)

    wrong = await _accept(async_client, stranger, token)
    assert wrong.status_code == 403
    assert await _membership(db_async, org.id, stranger.id) is None
    assert (await _accept(async_client, guest, token)).status_code == 200


async def test_unknown_token_and_missing_sign_in(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    user = await make_user(db_async)
    assert (await _accept(async_client, user, "x" * 43)).status_code == 400
    anonymous = await async_client.post(
        f"{API}/invitations/accept", json={"token": "x" * 43}
    )
    assert anonymous.status_code == 401


async def test_revoked_invitation_cannot_be_accepted(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    guest = await make_user(db_async)
    org = await make_org(
        db_async, "Revoke Co", members=((owner, MembershipRole.OWNER),)
    )
    created = (await _invite(async_client, owner, org, guest.email)).json()
    token = await _token_for(db_async, guest.email)

    listed = await async_client.get(
        f"{API}/{org.id}/invitations", headers=headers_for(owner, org.id)
    )
    assert [row["id"] for row in listed.json()] == [created["id"]]

    revoked = await async_client.delete(
        f"{API}/{org.id}/invitations/{created['id']}",
        headers=headers_for(owner, org.id),
    )
    assert revoked.status_code == 204
    assert (await _accept(async_client, guest, token)).status_code == 400
    listed = await async_client.get(
        f"{API}/{org.id}/invitations", headers=headers_for(owner, org.id)
    )
    assert listed.json() == []


async def test_reinviting_replaces_the_pending_invitation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    guest = await make_user(db_async)
    org = await make_org(
        db_async, "Resend Co", members=((owner, MembershipRole.OWNER),)
    )
    await _invite(async_client, owner, org, guest.email)
    first = await _token_for(db_async, guest.email)
    await _invite(async_client, owner, org, guest.email, "admin")
    second = await _token_for(db_async, guest.email)
    assert first != second

    assert (await _accept(async_client, guest, first)).status_code == 400
    accepted = await _accept(async_client, guest, second)
    assert accepted.status_code == 200
    assert accepted.json()["role"] == "admin"


async def test_cannot_invite_an_existing_member(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    member = await make_user(db_async)
    org = await make_org(
        db_async,
        "Dupe Co",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
    )
    assert (await _invite(async_client, owner, org, member.email)).status_code == 409


async def test_removed_member_can_rejoin_through_a_new_invitation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    member = await make_user(db_async)
    org = await make_org(
        db_async,
        "Rejoin Co",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
    )
    row = await _membership(db_async, org.id, member.id)
    removed = await async_client.delete(
        f"{API}/{org.id}/members/{row.id}", headers=headers_for(owner, org.id)
    )
    assert removed.status_code == 204
    assert (await _membership(db_async, org.id, member.id)).status == "removed"
    # Removed people lose access at once.
    denied = await async_client.get(
        f"{API}/current", headers=headers_for(member, org.id)
    )
    assert denied.status_code == 404

    await _invite(async_client, owner, org, member.email, "admin")
    token = await _token_for(db_async, member.email)
    assert (await _accept(async_client, member, token)).status_code == 200
    back = await _membership(db_async, org.id, member.id)
    assert (back.id, back.status, back.role) == (row.id, "active", "admin")


# ── Roles ────────────────────────────────────────────────────────────────────


async def test_members_list_is_for_admins_and_paginated(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    admin = await make_user(db_async)
    member = await make_user(db_async)
    org = await make_org(
        db_async,
        "Roster Co",
        members=(
            (owner, MembershipRole.OWNER),
            (admin, MembershipRole.ADMIN),
            (member, MembershipRole.MEMBER),
        ),
    )
    as_admin = await async_client.get(
        f"{API}/{org.id}/members", headers=headers_for(admin, org.id)
    )
    assert as_admin.status_code == 200
    body = as_admin.json()
    assert body["count"] == 3
    assert {row["email"] for row in body["data"]} == {
        owner.email,
        admin.email,
        member.email,
    }
    assert set(body["data"][0]) == {
        "membership_id",
        "user_id",
        "email",
        "full_name",
        "role",
        "joined_at",
    }
    page = await async_client.get(
        f"{API}/{org.id}/members?size=2&page=2", headers=headers_for(owner, org.id)
    )
    assert len(page.json()["data"]) == 1 and page.json()["count"] == 3

    as_member = await async_client.get(
        f"{API}/{org.id}/members", headers=headers_for(member, org.id)
    )
    assert as_member.status_code == 403


async def test_admin_cannot_invite_owners_or_touch_owners(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    admin = await make_user(db_async)
    member = await make_user(db_async)
    org = await make_org(
        db_async,
        "Roles Co",
        members=(
            (owner, MembershipRole.OWNER),
            (admin, MembershipRole.ADMIN),
            (member, MembershipRole.MEMBER),
        ),
    )
    as_admin = headers_for(admin, org.id)
    assert (
        await _invite(async_client, admin, org, "new@example.com", "owner")
    ).status_code == 403
    assert (
        await _invite(async_client, admin, org, "new@example.com", "admin")
    ).status_code == 201

    owner_row = await _membership(db_async, org.id, owner.id)
    member_row = await _membership(db_async, org.id, member.id)
    demote = await async_client.patch(
        f"{API}/{org.id}/members/{owner_row.id}",
        json={"role": "member"},
        headers=as_admin,
    )
    assert demote.status_code == 403
    remove = await async_client.delete(
        f"{API}/{org.id}/members/{owner_row.id}", headers=as_admin
    )
    assert remove.status_code == 403
    promote = await async_client.patch(
        f"{API}/{org.id}/members/{member_row.id}",
        json={"role": "owner"},
        headers=as_admin,
    )
    assert promote.status_code == 403

    ok = await async_client.patch(
        f"{API}/{org.id}/members/{member_row.id}",
        json={"role": "admin"},
        headers=as_admin,
    )
    assert ok.status_code == 200 and ok.json()["role"] == "admin"

    # A plain member cannot manage anyone.
    as_member = headers_for(member, org.id)
    assert (
        await async_client.delete(
            f"{API}/{org.id}/members/{owner_row.id}", headers=as_member
        )
    ).status_code == 403


async def test_owner_can_promote_to_owner(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    admin = await make_user(db_async)
    org = await make_org(
        db_async,
        "Promote Co",
        members=((owner, MembershipRole.OWNER), (admin, MembershipRole.ADMIN)),
    )
    row = await _membership(db_async, org.id, admin.id)
    response = await async_client.patch(
        f"{API}/{org.id}/members/{row.id}",
        json={"role": "owner"},
        headers=headers_for(owner, org.id),
    )
    assert response.status_code == 200
    assert response.json()["role"] == "owner"


async def test_last_owner_cannot_be_demoted_or_removed(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    second = await make_user(db_async)
    org = await make_org(
        db_async,
        "Last Co",
        members=((owner, MembershipRole.OWNER),),
    )
    as_owner = headers_for(owner, org.id)
    row = await _membership(db_async, org.id, owner.id)
    demote = await async_client.patch(
        f"{API}/{org.id}/members/{row.id}", json={"role": "admin"}, headers=as_owner
    )
    assert demote.status_code == 409
    remove = await async_client.delete(
        f"{API}/{org.id}/members/{row.id}", headers=as_owner
    )
    assert remove.status_code == 409
    assert (await _membership(db_async, org.id, owner.id)).role == "owner"

    # With a second owner the first may step down, then the second is protected.
    await _invite(async_client, owner, org, second.email, "owner")
    assert (
        await _accept(async_client, second, await _token_for(db_async, second.email))
    ).status_code == 200
    assert (
        await async_client.patch(
            f"{API}/{org.id}/members/{row.id}", json={"role": "admin"}, headers=as_owner
        )
    ).status_code == 200
    second_row = await _membership(db_async, org.id, second.id)
    assert (
        await async_client.delete(
            f"{API}/{org.id}/members/{second_row.id}",
            headers=headers_for(second, org.id),
        )
    ).status_code == 409


# ── Cross-organisation denial ────────────────────────────────────────────────


async def test_other_organisations_cannot_be_read_or_managed(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    mine_owner = await make_user(db_async)
    other_owner = await make_user(db_async)
    other_member = await make_user(db_async)
    mine = await make_org(
        db_async, "Mine Co", members=((mine_owner, MembershipRole.OWNER),)
    )
    other = await make_org(
        db_async,
        "Other Co",
        members=(
            (other_owner, MembershipRole.OWNER),
            (other_member, MembershipRole.MEMBER),
        ),
    )
    other_row = await _membership(db_async, other.id, other_member.id)
    pending = (await _invite(async_client, other_owner, other, "p@example.com")).json()
    headers = headers_for(mine_owner, mine.id)

    # Naming the other organisation in the path while holding my own header.
    for method, path, kwargs in (
        ("GET", f"{API}/{other.id}/members", {}),
        ("GET", f"{API}/{other.id}/invitations", {}),
        (
            "POST",
            f"{API}/{other.id}/invitations",
            {"json": {"email": "x@example.com", "role": "member"}},
        ),
        ("DELETE", f"{API}/{other.id}/invitations/{pending['id']}", {}),
        (
            "PATCH",
            f"{API}/{other.id}/members/{other_row.id}",
            {"json": {"role": "admin"}},
        ),
        ("DELETE", f"{API}/{other.id}/members/{other_row.id}", {}),
    ):
        response = await async_client.request(method, path, headers=headers, **kwargs)
        assert response.status_code == 404, (method, path)

    # Naming the other organisation in the header: not a member, so 404.
    as_outsider = headers_for(mine_owner, other.id)
    assert (
        await async_client.get(f"{API}/{other.id}/members", headers=as_outsider)
    ).status_code == 404

    # IDs from another organisation never resolve inside my own.
    assert (
        await async_client.delete(
            f"{API}/{mine.id}/members/{other_row.id}", headers=headers
        )
    ).status_code == 404
    assert (
        await async_client.patch(
            f"{API}/{mine.id}/members/{other_row.id}",
            json={"role": "admin"},
            headers=headers,
        )
    ).status_code == 404
    assert (
        await async_client.delete(
            f"{API}/{mine.id}/invitations/{pending['id']}", headers=headers
        )
    ).status_code == 404
    assert (await _membership(db_async, other.id, other_member.id)).role == "member"
    still = await db_async.scalar(
        select(Invitation).where(Invitation.id == pending["id"])
    )
    assert still.revoked_at is None


async def test_missing_organisation_header_is_rejected(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    org = await make_org(
        db_async, "Header Co", members=((owner, MembershipRole.OWNER),)
    )
    response = await async_client.get(
        f"{API}/{org.id}/members", headers=headers_for(owner)
    )
    assert response.status_code == 400


# ── Audit ────────────────────────────────────────────────────────────────────


async def test_membership_changes_are_audited_with_actor(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    guest = await make_user(db_async)
    org = await make_org(db_async, "Audit Co", members=((owner, MembershipRole.OWNER),))
    created = (await _invite(async_client, owner, org, guest.email)).json()
    await _accept(async_client, guest, await _token_for(db_async, guest.email))
    row = await _membership(db_async, org.id, guest.id)
    await async_client.patch(
        f"{API}/{org.id}/members/{row.id}",
        json={"role": "admin"},
        headers=headers_for(owner, org.id),
    )
    await async_client.delete(
        f"{API}/{org.id}/members/{row.id}", headers=headers_for(owner, org.id)
    )

    entries = list(
        (
            await db_async.scalars(
                select(AuditEntry)
                .where(
                    AuditEntry.entity_type == "platform_organisation",
                    AuditEntry.entity_id == org.id,
                )
                .order_by(AuditEntry.created_at)
                .execution_options(populate_existing=True)
            )
        ).all()
    )
    kinds = [(e.record_type, e.action, e.actor_user_id) for e in entries]
    assert ("organisation_invitation", "create", owner.id) in kinds
    # Acceptance is attributed to the person accepting.
    assert ("organisation_invitation", "update", guest.id) in kinds
    assert ("organisation_membership", "create", guest.id) in kinds
    assert ("organisation_membership", "update", owner.id) in kinds
    role_change = next(
        e
        for e in entries
        if e.record_type == "organisation_membership"
        and any(c["field"] == "role" and c["new"] == "admin" for c in e.changes)
    )
    assert role_change.actor_user_id == owner.id
    removal = [
        e
        for e in entries
        if e.record_type == "organisation_membership"
        and any(c["field"] == "status" and c["new"] == "removed" for c in e.changes)
    ]
    assert len(removal) == 1

    # The token hash never lands in history.
    for entry in entries:
        assert all(c["field"] != "token_hash" for c in entry.changes)
    assert created["id"] in {e.record_id for e in entries}


async def test_history_is_readable_by_organisation_admins_only(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    member = await make_user(db_async)
    outsider = await make_user(db_async)
    org = await make_org(
        db_async,
        "History Co",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
    )
    url = f"/api/v1/audit/platform_organisation/{org.id}"
    assert (await async_client.get(url, headers=headers_for(owner))).status_code == 200
    assert (await async_client.get(url, headers=headers_for(member))).status_code == 403
    assert (
        await async_client.get(url, headers=headers_for(outsider))
    ).status_code == 403


async def test_invitation_email_renders_through_the_jinja_fallback():
    from src.notifications.dispatch import _render_outbound

    row = OutboundEmail(
        to_email="guest@example.com",
        subject="You are invited to join <Acme & Co>",
        template="organisation-invitation",
        props={
            "projectName": "Barrels Grenada",
            "organisationName": "Acme & Co",
            "inviterName": "Alex",
            "roleLabel": "admin",
            "acceptLink": "https://auth.example.test/organisations/accept?token=abc",
            "validDays": 7,
        },
        transactional=True,
    )
    subject, html = await _render_outbound(row)
    assert "Acme &amp; Co" in html
    assert "organisations/accept?token=abc" in html
    assert "expires in 7 days" in html
    assert subject.startswith("You are invited")
