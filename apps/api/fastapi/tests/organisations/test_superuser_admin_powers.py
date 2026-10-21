"""Superuser admin powers (owner decision 2026-10-21): audited admin-activate and
admin membership routes that need an enrolled authenticator, with ADR-0022 intact."""

import uuid

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import totp
from src.auth.assignments import create_user_role_assignment
from src.auth.config import auth_settings
from src.auth.email_verification import (
    EmailNotVerifiedError,
    is_admin_activated,
    require_verified_email,
    require_verified_or_admin_activated,
)
from src.auth.models import Role, User
from src.auth.schemas import UserRoleAssignmentCreate
from src.organisations.models import Membership, MembershipRole, MembershipStatus
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

ORGS = "/api/v1/organisations"
ONBOARDING = "/api/v1/auth/onboarding"
REASON = {"reason": "Owner asked for support access (ticket 42)"}
SERVICES = "/api/v1/bookings/org/services"


@pytest.fixture(autouse=True)
def _totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


async def _mfa_superuser(db: AsyncSession) -> User:
    admin = await make_user(db, superuser=True)
    admin.totp_secret = totp.encrypt_secret(totp.generate_secret())
    admin.totp_enabled = True
    await db.commit()
    return admin


async def _unverified(db: AsyncSession) -> User:
    user = await make_user(db, verified=False)
    user.email_verification_required = True
    await db.commit()
    return user


async def _entries(db: AsyncSession, record_type: str, record_id: str):
    return list(
        (
            await db.scalars(
                select(AuditEntry)
                .where(
                    AuditEntry.record_type == record_type,
                    AuditEntry.record_id == record_id,
                )
                .order_by(AuditEntry.created_at)
                .execution_options(populate_existing=True)
            )
        ).all()
    )


def _changes(entry: AuditEntry) -> dict:
    return {c["field"]: c["new"] for c in entry.changes}


# ── Admin activate ───────────────────────────────────────────────────────────


async def test_admin_activate_unlocks_roles_but_not_deposits(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin = await _mfa_superuser(db_async)
    target = await _unverified(db_async)
    admin_id, target_id = admin.id, target.id
    headers = headers_for(admin)
    with pytest.raises(EmailNotVerifiedError):
        await require_verified_or_admin_activated(db_async, target, "act")

    url = f"{ONBOARDING}/{target_id}/admin-activate"
    response = await async_client.post(url, headers=headers, json=REASON)
    assert response.status_code == 200, response.text
    assert response.json()["admin_activated"] is True
    assert response.json()["email_verified"] is False

    db_async.expire_all()
    target = await db_async.get(User, target_id)
    assert target.email_verified_at is None
    assert target.email_verification_required is False
    assert await is_admin_activated(db_async, target)
    await require_verified_or_admin_activated(db_async, target, "act")  # roles gate
    with pytest.raises(EmailNotVerifiedError):  # deposit gate stays strict
        require_verified_email(target, "pay a deposit")

    role = Role(name=f"adm_act_{uuid.uuid4().hex[:8]}", description="test")
    db_async.add(role)
    await db_async.commit()
    created = await create_user_role_assignment(
        session=db_async,
        assignment_in=UserRoleAssignmentCreate(user_id=target_id, role_id=role.id),
    )
    assert created.user_id == target_id

    (entry,) = await _entries(db_async, "account_activation", str(target_id))
    assert entry.action == "activated"
    assert entry.actor_user_id == admin_id
    assert _changes(entry)["reason"] == REASON["reason"]
    assert _changes(entry)["admin_override"] is True


async def test_admin_activate_is_idempotent(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, target = await _mfa_superuser(db_async), await _unverified(db_async)
    url = f"{ONBOARDING}/{target.id}/admin-activate"
    for _ in range(2):
        r = await async_client.post(url, headers=headers_for(admin), json=REASON)
        assert r.status_code == 200
    assert len(await _entries(db_async, "account_activation", str(target.id))) == 1


async def test_admin_activate_refuses_inactive_and_superuser_targets(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin = await _mfa_superuser(db_async)
    inactive = await _unverified(db_async)
    inactive.is_active = False
    other_admin = await make_user(db_async, superuser=True, verified=False)
    await db_async.commit()
    for target in (inactive, other_admin):
        r = await async_client.post(
            f"{ONBOARDING}/{target.id}/admin-activate",
            headers=headers_for(admin),
            json=REASON,
        )
        assert r.status_code == 409, r.text
    missing = await async_client.post(
        f"{ONBOARDING}/{uuid.uuid4()}/admin-activate",
        headers=headers_for(admin),
        json=REASON,
    )
    assert missing.status_code == 404


async def test_admin_activate_needs_a_real_reason(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, target = await _mfa_superuser(db_async), await _unverified(db_async)
    for body in ({}, {"reason": "short"}, {"reason": "          "}):
        r = await async_client.post(
            f"{ONBOARDING}/{target.id}/admin-activate",
            headers=headers_for(admin),
            json=body,
        )
        assert r.status_code == 422


async def test_resend_verification_reports_failed_delivery_and_audits(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def boom(**_: object) -> None:
        raise RuntimeError("Email is not configured")

    monkeypatch.setattr("src.auth.modern_service.send_email", boom)
    admin, target = await _mfa_superuser(db_async), await _unverified(db_async)
    r = await async_client.post(
        f"{ONBOARDING}/{target.id}/resend-verification",
        headers=headers_for(admin),
        json=REASON,
    )
    assert r.status_code == 200, r.text
    assert r.json()["delivered"] is False
    (entry,) = await _entries(db_async, "account_activation", str(target.id))
    assert entry.action == "resend_failed"
    assert entry.actor_user_id == admin.id

    monkeypatch.setattr("src.auth.modern_service.send_email", lambda **_: None)
    ok = await async_client.post(
        f"{ONBOARDING}/{target.id}/resend-verification",
        headers=headers_for(admin),
        json=REASON,
    )
    assert ok.json()["delivered"] is True


# ── MFA and role gates (every new route) ─────────────────────────────────────


async def test_routes_need_superuser_with_authenticator(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    no_mfa = await make_user(db_async, superuser=True)
    manager = await make_user(db_async)  # stands in for a user.manage holder
    owner = await make_user(db_async)
    org = await make_org(db_async, "Gate Co", members=((owner, MembershipRole.OWNER),))
    target = await _unverified(db_async)
    calls = [
        ("POST", f"{ONBOARDING}/{target.id}/admin-activate", REASON),
        ("POST", f"{ONBOARDING}/{target.id}/resend-verification", REASON),
        (
            "POST",
            f"{ORGS}/{org.id}/admin/members",
            {"user_id": str(target.id), "role": "member", **REASON},
        ),
        ("PATCH", f"{ORGS}/{org.id}/admin/members/x", {"role": "member", **REASON}),
        ("DELETE", f"{ORGS}/{org.id}/admin/members/x", REASON),
    ]
    for method, url, body in calls:
        r = await async_client.request(
            method, url, headers=headers_for(no_mfa), json=body
        )
        assert r.status_code == 403, (method, url, r.text)
        assert "superuser_mfa_required" in r.json()["detail"]
        for who in (manager, owner):
            r = await async_client.request(
                method, url, headers=headers_for(who), json=body
            )
            assert r.status_code == 403, (method, url, r.text)
            assert "superuser_mfa_required" not in r.json()["detail"]
        assert (await async_client.request(method, url, json=body)).status_code == 401


async def test_mfa_requirement_holds_even_when_privileged_mfa_is_off(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "off")
    no_mfa = await make_user(db_async, superuser=True)
    target = await _unverified(db_async)
    r = await async_client.post(
        f"{ONBOARDING}/{target.id}/admin-activate",
        headers=headers_for(no_mfa),
        json=REASON,
    )
    assert r.status_code == 403


# ── Admin membership ─────────────────────────────────────────────────────────


async def test_non_member_superuser_adds_someone_with_audit(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin = await _mfa_superuser(db_async)
    owner, person = await make_user(db_async), await make_user(db_async)
    org = await make_org(db_async, "Add Co", members=((owner, MembershipRole.OWNER),))
    r = await async_client.post(
        f"{ORGS}/{org.id}/admin/members",
        headers=headers_for(admin),
        json={"email": person.email, "role": "admin", **REASON},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user_id"] == str(person.id) and body["role"] == "admin"
    (entry,) = await _entries(
        db_async, "platform_organisation_member", body["membership_id"]
    )
    assert entry.actor_user_id == admin.id
    assert entry.action == "add"
    changes = _changes(entry)
    assert changes["target_user_id"] == str(person.id)
    assert changes["reason"] == REASON["reason"]
    assert changes["self_service"] is False
    again = await async_client.post(
        f"{ORGS}/{org.id}/admin/members",
        headers=headers_for(admin),
        json={"user_id": str(person.id), **REASON},
    )
    assert again.status_code == 409


async def test_superuser_can_add_themselves_and_it_is_audited(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin = await _mfa_superuser(db_async)
    owner = await make_user(db_async)
    org = await make_org(db_async, "Self Co", members=((owner, MembershipRole.OWNER),))
    r = await async_client.post(
        f"{ORGS}/{org.id}/admin/members",
        headers=headers_for(admin),
        json={"user_id": str(admin.id), "role": "member", **REASON},
    )
    assert r.status_code == 201, r.text
    (entry,) = await _entries(
        db_async, "platform_organisation_member", r.json()["membership_id"]
    )
    assert entry.actor_user_id == admin.id
    assert _changes(entry)["self_service"] is True
    # Now a member, the org-scoped route works (through membership, not bypass).
    me = await async_client.get(f"{ORGS}/mine", headers=headers_for(admin))
    assert org.id in {m["organisation"]["id"] for m in me.json()}


async def test_owner_and_admin_roles_need_unlocked_target(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin = await _mfa_superuser(db_async)
    org = await make_org(db_async, "Gate Org")
    target = await _unverified(db_async)
    url = f"{ORGS}/{org.id}/admin/members"
    body = {"user_id": str(target.id), "role": "owner", **REASON}
    refused = await async_client.post(url, headers=headers_for(admin), json=body)
    assert refused.status_code == 403
    assert "email_verification_required" in refused.json()["detail"]
    # A plain member is fine, and admin-activate then unlocks the owner role.
    ok = await async_client.post(
        url, headers=headers_for(admin), json={**body, "role": "member"}
    )
    assert ok.status_code == 201
    mid = ok.json()["membership_id"]
    assert (
        await async_client.patch(
            f"{url}/{mid}", headers=headers_for(admin), json={"role": "owner", **REASON}
        )
    ).status_code == 403
    await async_client.post(
        f"{ONBOARDING}/{target.id}/admin-activate",
        headers=headers_for(admin),
        json=REASON,
    )
    promoted = await async_client.patch(
        f"{url}/{mid}", headers=headers_for(admin), json={"role": "owner", **REASON}
    )
    assert promoted.status_code == 200 and promoted.json()["role"] == "owner"
    entries = await _entries(db_async, "platform_organisation_member", mid)
    assert [e.action for e in entries] == ["add", "change_role"]
    assert entries[1].changes[2]["old"] == "member"


async def test_owner_grant_requires_a_reason(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, person = await _mfa_superuser(db_async), await make_user(db_async)
    org = await make_org(db_async, "Reason Co")
    url = f"{ORGS}/{org.id}/admin/members"
    for body in ({}, {"reason": "short"}):
        r = await async_client.post(
            url,
            headers=headers_for(admin),
            json={"user_id": str(person.id), "role": "owner", **body},
        )
        assert r.status_code == 422
    assert (
        await async_client.post(
            url,
            headers=headers_for(admin),
            json={"role": "owner", **REASON},  # no target
        )
    ).status_code == 422


async def test_last_owner_rule_still_applies(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, owner = await _mfa_superuser(db_async), await make_user(db_async)
    admin_id, owner_id, ah = admin.id, owner.id, headers_for(admin)
    org = await make_org(db_async, "Last Co", members=((owner, MembershipRole.OWNER),))
    org_id = org.id
    mid = await db_async.scalar(
        select(Membership.id).where(Membership.organisation_id == org.id)
    )
    url = f"{ORGS}/{org_id}/admin/members/{mid}"
    demote = await async_client.patch(
        url, headers=ah, json={"role": "member", **REASON}
    )
    assert demote.status_code == 409
    remove = await async_client.request("DELETE", url, headers=ah, json=REASON)
    assert remove.status_code == 409
    # With a second owner, the first can be removed (superuser acts as owner).
    second = await make_user(db_async)
    added = await async_client.post(
        f"{ORGS}/{org_id}/admin/members",
        headers=ah,
        json={"user_id": str(second.id), "role": "owner", **REASON},
    )
    assert added.status_code == 201
    gone = await async_client.request("DELETE", url, headers=ah, json=REASON)
    assert gone.status_code == 204
    db_async.expire_all()
    row = await db_async.get(Membership, mid)
    assert row.status == MembershipStatus.REMOVED.value
    (entry,) = await _entries(db_async, "platform_organisation_member", mid)
    assert entry.action == "remove" and entry.actor_user_id == admin_id
    # A removed member can be added back (row is reactivated).
    back = await async_client.post(
        f"{ORGS}/{org_id}/admin/members",
        headers=ah,
        json={"user_id": str(owner_id), "role": "member", **REASON},
    )
    assert back.status_code == 201 and back.json()["membership_id"] == mid


async def test_membership_is_scoped_to_the_path_organisation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin = await _mfa_superuser(db_async)
    owner_a, owner_b = await make_user(db_async), await make_user(db_async)
    org_a = await make_org(db_async, "A Co", members=((owner_a, MembershipRole.OWNER),))
    org_b = await make_org(db_async, "B Co", members=((owner_b, MembershipRole.OWNER),))
    mid_b = await db_async.scalar(
        select(Membership.id).where(Membership.organisation_id == org_b.id)
    )
    r = await async_client.patch(
        f"{ORGS}/{org_a.id}/admin/members/{mid_b}",
        headers=headers_for(admin),
        json={"role": "member", **REASON},
    )
    assert r.status_code == 404
    missing_org = await async_client.post(
        f"{ORGS}/org_nope/admin/members",
        headers=headers_for(admin),
        json={"user_id": str(owner_a.id), **REASON},
    )
    assert missing_org.status_code == 404


# ── ADR-0022 regression ──────────────────────────────────────────────────────


async def test_superuser_still_has_no_silent_organisation_bypass(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin = await _mfa_superuser(db_async)
    owner = await make_user(db_async)
    org = await make_org(
        db_async,
        "Closed Co",
        members=((owner, MembershipRole.OWNER),),
        apps=("bookings",),
    )
    outside = await async_client.get(SERVICES, headers=headers_for(admin, org.id))
    assert outside.status_code == 404
    # The roster route in the organisation scope is also closed to a non-member.
    scoped = await async_client.get(
        f"{ORGS}/{org.id}/members", headers=headers_for(admin, org.id)
    )
    assert scoped.status_code == 404
    # Adding a member elsewhere gives no access to this organisation.
    other = await make_org(db_async, "Open Co")
    await async_client.post(
        f"{ORGS}/{other.id}/admin/members",
        headers=headers_for(admin),
        json={"user_id": str(admin.id), **REASON},
    )
    still = await async_client.get(SERVICES, headers=headers_for(admin, org.id))
    assert still.status_code == 404
    # After becoming a member of this organisation, access works.
    await async_client.post(
        f"{ORGS}/{org.id}/admin/members",
        headers=headers_for(admin),
        json={"user_id": str(admin.id), **REASON},
    )
    assert (
        await async_client.get(SERVICES, headers=headers_for(admin, org.id))
    ).status_code == 200
