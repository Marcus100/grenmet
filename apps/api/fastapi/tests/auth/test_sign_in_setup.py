"""Administrator-issued sign-in setup: a one-use, 72-hour link for the person to pick a password.

Real database and real JWTs. The link never verifies email, never grants roles or app
access and never changes the email-verification flags.
"""

import asyncio
import uuid
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from src.audit.models import AuditEntry
from src.auth import email_verification, modern_service, service, sign_in_setup, totp
from src.auth.config import auth_settings
from src.auth.models import Role, RoleAssignmentScope, User
from src.auth.modern_models import AuthChallenge
from src.auth.utils import get_password_hash, verify_password_async
from src.hr.models import EmploymentRecord, EmploymentStatus
from src.notifications.models import OutboundEmail
from src.organisations.models import Membership, MembershipRole, MembershipStatus
from src.utils.datetime import utc_now
from tests.factories import (
    assign_role,
    make_employee,
    make_role_with_permission,
    make_supervised_pair,
    make_user,
)

BASE = "/api/v1/auth/onboarding"
PASSWORD = "My-new-password-123!"
MANAGE = "user.manage"
ISSUE = {"identity_confirmed": True, "reason": "Work mailbox not live yet"}


@pytest.fixture
def encryption_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


async def mfa_headers(db, user: User, *, verified: bool = True) -> dict[str, str]:
    """Bearer headers for a session; the authenticator is enrolled, MFA passed if verified."""
    user.totp_secret = totp.encrypt_secret(totp.generate_secret())
    user.totp_enabled = True
    await db.commit()
    stored, _ = await service.create_session(
        session=db,
        user=user,
        app_name=None,
        enforce_approval=False,
        mfa_verified_at=utc_now() if verified else None,
    )
    token, _ = service.issue_access_token_for_user(user=user, db_session=stored)
    return {"Authorization": f"Bearer {token}"}


def token_from(response) -> str:
    assert response.status_code == 201, response.text
    return parse_qs(urlparse(response.json()["activation_url"]).fragment)["token"][0]


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_issue_is_refused_without_user_manage(async_client, db_async):
    plain = await make_user(db_async)
    target = await make_user(db_async)
    headers = await mfa_headers(db_async, plain)
    response = await async_client.post(
        f"{BASE}/{target.id}/sign-in-setup",
        headers=headers,
        json=ISSUE,
    )
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_issue_requires_an_mfa_verified_session(
    async_client, db_async, monkeypatch
):
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "disabled")
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    headers = await mfa_headers(db_async, supervisor, verified=False)
    response = await async_client.post(
        f"{BASE}/{employee.id}/sign-in-setup",
        headers=headers,
        json=ISSUE,
    )
    assert response.status_code == 403
    assert "Sign in again" in response.text


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_issue_requires_an_enrolled_authenticator(async_client, db_async):
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    superuser = await make_user(db_async, superuser=True)
    superuser.totp_enabled = False
    await db_async.commit()
    stored, _ = await service.create_session(
        session=db_async,
        user=superuser,
        app_name=None,
        enforce_approval=False,
        mfa_verified_at=utc_now(),
    )
    token, _ = service.issue_access_token_for_user(user=superuser, db_session=stored)
    response = await async_client.post(
        f"{BASE}/{employee.id}/sign-in-setup",
        headers={"Authorization": f"Bearer {token}"},
        json=ISSUE,
    )
    assert response.status_code == 403
    assert "mfa_enrolment_required" in response.text


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_out_of_scope_and_unknown_accounts_are_not_found(async_client, db_async):
    supervisor, _, _, _ = await make_supervised_pair(db_async, MANAGE)
    outsider = await make_user(db_async)
    headers = await mfa_headers(db_async, supervisor)
    for target_id in (outsider.id, uuid.uuid4()):
        response = await async_client.post(
            f"{BASE}/{target_id}/sign-in-setup",
            headers=headers,
            json=ISSUE,
        )
        assert response.status_code == 404, response.text


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_self_is_refused(async_client, db_async):
    supervisor, _, _, _ = await make_supervised_pair(db_async, MANAGE)
    headers = await mfa_headers(db_async, supervisor)
    response = await async_client.post(
        f"{BASE}/{supervisor.id}/sign-in-setup",
        headers=headers,
        json=ISSUE,
    )
    assert response.status_code == 403


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_superuser_target_is_outside_a_scoped_manager(async_client, db_async):
    supervisor, _, dept, _ = await make_supervised_pair(db_async, MANAGE)
    platform_admin = await make_user(db_async, superuser=True)
    await make_employee(
        db_async, user=platform_admin, department_id=dept.id, position="Admin"
    )
    headers = await mfa_headers(db_async, supervisor)
    response = await async_client.post(
        f"{BASE}/{platform_admin.id}/sign-in-setup",
        headers=headers,
        json=ISSUE,
    )
    assert response.status_code == 404


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_owner_refused_for_scoped_manager_but_allowed_for_superuser(
    async_client, db_async
):
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    db_async.add(
        Membership(
            id=uuid.uuid4().hex,
            organisation_id="gaa",
            user_id=employee.id,
            role=MembershipRole.OWNER.value,
            status=MembershipStatus.ACTIVE.value,
        )
    )
    await db_async.commit()
    scoped = await async_client.post(
        f"{BASE}/{employee.id}/sign-in-setup",
        headers=await mfa_headers(db_async, supervisor),
        json=ISSUE,
    )
    assert scoped.status_code == 403
    superuser = await make_user(db_async, superuser=True)
    allowed = await async_client.post(
        f"{BASE}/{employee.id}/sign-in-setup",
        headers=await mfa_headers(db_async, superuser),
        json=ISSUE,
    )
    assert allowed.status_code == 201, allowed.text


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_inactive_target_is_refused(async_client, db_async):
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    employee.is_active = False
    await db_async.commit()
    response = await async_client.post(
        f"{BASE}/{employee.id}/sign-in-setup",
        headers=await mfa_headers(db_async, supervisor),
        json=ISSUE,
    )
    assert response.status_code == 409


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_ended_employment_is_refused(async_client, db_async):
    _, employee, dept, _ = await make_supervised_pair(db_async, MANAGE)
    record = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == employee.id)
    )
    record.status = EmploymentStatus.TERMINATED
    await db_async.commit()
    superuser = await make_user(db_async, superuser=True)
    response = await async_client.post(
        f"{BASE}/{employee.id}/sign-in-setup",
        headers=await mfa_headers(db_async, superuser),
        json=ISSUE,
    )
    assert response.status_code == 409


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_identity_must_be_confirmed(async_client, db_async):
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    response = await async_client.post(
        f"{BASE}/{employee.id}/sign-in-setup",
        headers=await mfa_headers(db_async, supervisor),
        json={"identity_confirmed": False},
    )
    assert response.status_code == 400


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_link_is_hashed_72_hours_and_no_store(async_client, db_async):
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    issued = await async_client.post(
        f"{BASE}/{employee.id}/sign-in-setup",
        headers=await mfa_headers(db_async, supervisor),
        json=ISSUE,
    )
    token = token_from(issued)
    assert issued.headers["cache-control"] == "no-store"
    challenge = await db_async.get(AuthChallenge, modern_service.digest(token))
    assert challenge is not None and challenge.token_hash != token
    assert challenge.purpose == sign_in_setup.PURPOSE
    remaining = challenge.expires_at - utc_now()
    assert timedelta(hours=23, minutes=59) < remaining <= timedelta(hours=24)
    stored = await db_async.scalars(select(AuthChallenge.token_hash))
    assert token not in list(stored)


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_reissue_replaces_the_previous_link(async_client, db_async):
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    headers = await mfa_headers(db_async, supervisor)
    first = token_from(
        await async_client.post(
            f"{BASE}/{employee.id}/sign-in-setup",
            headers=headers,
            json=ISSUE,
        )
    )
    second = token_from(
        await async_client.post(
            f"{BASE}/{employee.id}/sign-in-setup",
            headers=headers,
            json=ISSUE,
        )
    )
    old = await async_client.post(
        f"{BASE}/activate", json={"token": first, "new_password": PASSWORD}
    )
    assert old.status_code == 400
    new = await async_client.post(
        f"{BASE}/activate", json={"token": second, "new_password": PASSWORD}
    )
    assert new.status_code == 200, new.text


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_revoke_invalidates_and_is_scoped(async_client, db_async):
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    outsider = await make_user(db_async)
    headers = await mfa_headers(db_async, supervisor)
    token = token_from(
        await async_client.post(
            f"{BASE}/{employee.id}/sign-in-setup",
            headers=headers,
            json=ISSUE,
        )
    )
    denied = await async_client.delete(
        f"{BASE}/{outsider.id}/sign-in-setup", headers=headers
    )
    assert denied.status_code == 404
    revoked = await async_client.delete(
        f"{BASE}/{employee.id}/sign-in-setup", headers=headers
    )
    assert revoked.status_code == 204
    response = await async_client.post(
        f"{BASE}/activate", json={"token": token, "new_password": PASSWORD}
    )
    assert response.status_code == 400


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
@pytest.mark.parametrize(
    "failure",
    ["expired", "password_changed", "email_changed", "issuer_inactive", "ended"],
)
async def test_invalid_link_cannot_change_the_password(async_client, db_async, failure):
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    employee_id = employee.id
    token = token_from(
        await async_client.post(
            f"{BASE}/{employee_id}/sign-in-setup",
            headers=await mfa_headers(db_async, supervisor),
            json=ISSUE,
        )
    )
    user = await db_async.get(User, employee_id)
    changed_hash = user.hashed_password
    if failure == "expired":
        challenge = await db_async.get(AuthChallenge, modern_service.digest(token))
        challenge.expires_at = utc_now() - timedelta(seconds=1)
    elif failure == "password_changed":
        changed_hash = get_password_hash("Changed-elsewhere-1!")
        user.hashed_password = changed_hash
    elif failure == "email_changed":
        user.email = f"moved-{uuid.uuid4().hex}@example.com"
    elif failure == "issuer_inactive":
        supervisor.is_active = False
    elif failure == "ended":
        record = await db_async.scalar(
            select(EmploymentRecord).where(EmploymentRecord.user_id == employee_id)
        )
        record.status = EmploymentStatus.TERMINATED
    await db_async.commit()
    response = await async_client.post(
        f"{BASE}/activate", json={"token": token, "new_password": PASSWORD}
    )
    assert response.status_code == 400
    db_async.expire_all()
    user = await db_async.get(User, employee_id)
    assert user.hashed_password == changed_hash
    assert not await verify_password_async(PASSWORD, user.hashed_password)


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_single_use(async_client, db_async):
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    token = token_from(
        await async_client.post(
            f"{BASE}/{employee.id}/sign-in-setup",
            headers=await mfa_headers(db_async, supervisor),
            json=ISSUE,
        )
    )
    first = await async_client.post(
        f"{BASE}/activate", json={"token": token, "new_password": PASSWORD}
    )
    assert first.status_code == 200, first.text
    replay = await async_client.post(
        f"{BASE}/activate", json={"token": token, "new_password": "Other-password-456!"}
    )
    assert replay.status_code == 400


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_per_target_and_per_admin_rate_limits(
    async_client, db_async, monkeypatch
):
    supervisor, employee, dept, _ = await make_supervised_pair(db_async, MANAGE)
    headers = await mfa_headers(db_async, supervisor)
    for _ in range(sign_in_setup.ISSUE_LIMIT_PER_TARGET):
        token_from(
            await async_client.post(
                f"{BASE}/{employee.id}/sign-in-setup",
                headers=headers,
                json=ISSUE,
            )
        )
    capped = await async_client.post(
        f"{BASE}/{employee.id}/sign-in-setup",
        headers=headers,
        json=ISSUE,
    )
    assert capped.status_code == 429
    monkeypatch.setattr(sign_in_setup, "ISSUE_LIMIT_PER_ADMIN", 2)
    other = await make_employee(
        db_async, user=await make_user(db_async), department_id=dept.id
    )
    second = await async_client.post(
        f"{BASE}/{other.user_id}/sign-in-setup",
        headers=headers,
        json=ISSUE,
    )
    assert second.status_code == 429


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_audit_names_ids_and_expiry_but_no_secret(async_client, db_async):
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    token = token_from(
        await async_client.post(
            f"{BASE}/{employee.id}/sign-in-setup",
            headers=await mfa_headers(db_async, supervisor),
            json=ISSUE,
        )
    )
    await async_client.post(
        f"{BASE}/activate", json={"token": token, "new_password": PASSWORD}
    )
    rows = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.record_type == "sign_in_setup",
                AuditEntry.entity_id == str(employee.id),
            )
        )
    ).all()
    actions = {row.action for row in rows}
    assert actions == {"issued", "completed"}
    issued = next(row for row in rows if row.action == "issued")
    assert issued.actor_user_id == supervisor.id
    for row in rows:
        text = str(row.changes)
        assert token not in text and PASSWORD not in text
        assert "@" not in text
        assert "expires_at" in text or row.action == "completed"


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_full_journey_admin_issues_person_signs_in_with_password(
    async_client, db_async
):
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    employee_id = employee.id
    before = await db_async.get(User, employee_id)
    verified_before = before.email_verified_at
    flag_before = before.email_verification_required
    token = token_from(
        await async_client.post(
            f"{BASE}/{employee_id}/sign-in-setup",
            headers=await mfa_headers(db_async, supervisor),
            json=ISSUE,
        )
    )
    done = await async_client.post(
        f"{BASE}/activate", json={"token": token, "new_password": PASSWORD}
    )
    assert done.status_code == 200, done.text
    db_async.expire_all()
    user = await db_async.get(User, employee_id)
    assert user.email_verified_at == verified_before
    assert user.email_verification_required == flag_before
    assert user.password_setup_pending is False
    login = await async_client.post(
        "/api/v1/auth/sessions", json={"email": user.email, "password": PASSWORD}
    )
    assert login.status_code == 200, login.text
    assert await email_verification.is_admin_activated(db_async, user) is False


async def grant(db, user, *keys, role_name=None, department_id=None):
    role, _ = await make_role_with_permission(db, *keys, role_name=role_name)
    await assign_role(
        db,
        user=user,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=department_id,
    )


async def seeded_role(db, name):
    return await db.scalar(
        select(Role).where(Role.name == name).options(selectinload(Role.permissions))
    )


async def issue_status(client, headers, target_id, body=ISSUE):
    return await client.post(
        f"{BASE}/{target_id}/sign-in-setup", headers=headers, json=body
    )


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_manager_cannot_set_up_a_holder_of_user_manage(async_client, db_async):
    supervisor, employee, dept, _ = await make_supervised_pair(db_async, MANAGE)
    employee_id = employee.id
    await grant(db_async, employee, MANAGE, department_id=dept.id)
    # With an authenticator enrolled the no-authenticator refusal does not fire first.
    employee.totp_secret = totp.encrypt_secret(totp.generate_secret())
    employee.totp_enabled = True
    await db_async.commit()
    response = await issue_status(
        async_client, await mfa_headers(db_async, supervisor), employee_id
    )
    assert response.status_code == 403, response.text
    assert "Only a superuser" in response.text


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_manager_cannot_set_up_a_privileged_key_holder(async_client, db_async):
    supervisor, employee, dept, _ = await make_supervised_pair(db_async, MANAGE)
    employee_id = employee.id
    await grant(db_async, employee, "cap.alert.approve", department_id=dept.id)
    response = await issue_status(
        async_client, await mfa_headers(db_async, supervisor), employee_id
    )
    assert response.status_code == 403, response.text


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_manager_cannot_set_up_someone_holding_a_permission_they_lack(
    async_client, db_async
):
    supervisor, employee, dept, _ = await make_supervised_pair(db_async, MANAGE)
    employee_id = employee.id
    await grant(db_async, employee, "hr.employment.manage", department_id=dept.id)
    response = await issue_status(
        async_client, await mfa_headers(db_async, supervisor), employee_id
    )
    assert response.status_code == 403, response.text


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_manager_cannot_set_up_a_department_manager_role_holder(
    async_client, db_async
):
    supervisor, employee, dept, _ = await make_supervised_pair(db_async, MANAGE)
    employee_id = employee.id
    role, _ = await make_role_with_permission(
        db_async, "hr.employment.manage", role_name="hr-supervisor"
    )
    await assign_role(
        db_async,
        user=employee,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=dept.id,
    )
    response = await issue_status(
        async_client, await mfa_headers(db_async, supervisor), employee_id
    )
    assert response.status_code == 403, response.text


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_privileged_target_without_authenticator_needs_a_superuser(
    async_client, db_async
):
    supervisor, employee, dept, _ = await make_supervised_pair(db_async, MANAGE)
    employee_id = employee.id
    await grant(db_async, employee, "cap.alert.approve", department_id=dept.id)
    assert employee.totp_enabled is False
    manager_response = await issue_status(
        async_client, await mfa_headers(db_async, supervisor), employee_id
    )
    assert manager_response.status_code == 403
    superuser = await make_user(db_async, superuser=True)
    admin_response = await issue_status(
        async_client, await mfa_headers(db_async, superuser), employee_id
    )
    assert admin_response.status_code == 201, admin_response.text


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_ordinary_staff_can_be_set_up_by_a_manager(async_client, db_async):
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    response = await issue_status(
        async_client, await mfa_headers(db_async, supervisor), employee.id
    )
    assert response.status_code == 201, response.text


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_reason_required_when_the_person_email_works(async_client, db_async):
    supervisor, employee, dept, _ = await make_supervised_pair(db_async, MANAGE)
    employee_id = employee.id
    headers = await mfa_headers(db_async, supervisor)
    no_reason = await issue_status(
        async_client, headers, employee_id, {"identity_confirmed": True}
    )
    assert no_reason.status_code == 400
    assert "reason" in no_reason.text.lower()
    too_short = await issue_status(
        async_client,
        headers,
        employee_id,
        {"identity_confirmed": True, "reason": "ab"},
    )
    assert too_short.status_code == 422
    accepted = await issue_status(async_client, headers, employee_id)
    assert accepted.status_code == 201, accepted.text


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_no_reason_needed_when_email_is_unverified_or_setup_pending(
    async_client, db_async
):
    supervisor, _, dept, _ = await make_supervised_pair(db_async, MANAGE)
    unverified = await make_employee(
        db_async, user=await make_user(db_async, verified=False), department_id=dept.id
    )
    pending_user = await make_user(db_async)
    pending_user.password_setup_pending = True
    await db_async.commit()
    pending = await make_employee(db_async, user=pending_user, department_id=dept.id)
    headers = await mfa_headers(db_async, supervisor)
    for target in (unverified.user_id, pending.user_id):
        response = await issue_status(
            async_client, headers, target, {"identity_confirmed": True}
        )
        assert response.status_code == 201, response.text


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_courtesy_notices_are_queued_on_issue_and_completion(
    async_client, db_async
):
    supervisor, employee, _, _ = await make_supervised_pair(db_async, MANAGE)
    address = employee.email.lower()
    token = token_from(
        await issue_status(
            async_client, await mfa_headers(db_async, supervisor), employee.id
        )
    )
    issued = (
        await db_async.scalars(
            select(OutboundEmail).where(OutboundEmail.to_email == address)
        )
    ).all()
    assert len(issued) == 1
    assert "sign-in link" in issued[0].subject
    assert token not in (issued[0].html or "")
    assert "/activate" not in (issued[0].html or "")
    done = await async_client.post(
        f"{BASE}/activate", json={"token": token, "new_password": PASSWORD}
    )
    assert done.status_code == 200, done.text
    all_rows = (
        await db_async.scalars(
            select(OutboundEmail).where(OutboundEmail.to_email == address)
        )
    ).all()
    assert len(all_rows) == 2
    assert any("password was set up" in row.subject for row in all_rows)


@pytest.mark.asyncio
@pytest.mark.usefixtures("db_async", "encryption_keys")
async def test_per_admin_cap_holds_under_concurrent_issues(
    async_client, db_async, monkeypatch
):
    supervisor, employee, dept, _ = await make_supervised_pair(db_async, MANAGE)
    targets = [employee.id]
    for _ in range(3):
        record = await make_employee(
            db_async, user=await make_user(db_async), department_id=dept.id
        )
        targets.append(record.user_id)
    monkeypatch.setattr(sign_in_setup, "ISSUE_LIMIT_PER_ADMIN", 2)
    headers = await mfa_headers(db_async, supervisor)
    responses = await asyncio.gather(
        *(issue_status(async_client, headers, target) for target in targets)
    )
    codes = sorted(response.status_code for response in responses)
    assert codes.count(201) == 2, codes
    assert codes.count(429) == 2, codes
