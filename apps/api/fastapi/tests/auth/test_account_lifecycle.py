import uuid
from datetime import timedelta

import httpx
import pyotp
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import account_security, modern_service, service
from src.auth.models import User
from src.auth.modern_service import drain_setup_emails
from src.auth.utils import create_access_token
from src.exceptions import AppException
from src.hr.models import Grade
from src.organisations.models import MembershipRole
from src.rewards import service as rewards_service
from src.rewards.schemas import ProgramCreate
from tests.factories import make_department, make_role_with_permission, make_user
from tests.organisations.support import make_org


async def make_self_signup_user(
    session: AsyncSession,
    *,
    email: str,
    username: str,
    password: str,
    first_name: str,
    last_name: str,
) -> uuid.UUID:
    """The state the retired password sign-up used to create: unverified, pending staff approval."""
    from src.auth.utils import get_password_hash_async

    user = User(
        email=email,
        username=username,
        first_name=first_name,
        last_name=last_name,
        hashed_password=await get_password_hash_async(password),
        registration_pending=True,
        email_verification_required=True,
        is_active=True,
        is_superuser=False,
    )
    session.add(user)
    await session.commit()
    await session.refresh(user)
    return user.id


async def test_password_reset_is_single_use_and_revokes_sessions(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    _, secret = await service.create_session(session=db_async, user=user)
    token = await modern_service.issue(
        db_async, "password-reset", user_id=user.id, data={"email": user.email}
    )
    await db_async.commit()
    body = {"token": token, "new_password": "new-long-password"}
    assert (
        await async_client.post("/api/v1/auth/password/reset", json=body)
    ).status_code == 200
    assert (
        await async_client.post("/api/v1/auth/password/reset", json=body)
    ).status_code == 400
    assert (
        await service.get_active_session_by_secret(
            session=db_async, session_secret=secret
        )
        is None
    )


async def test_mfa_recovery_code_is_hashed_and_single_use(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    user.totp_enabled = True
    user.totp_secret = pyotp.random_base32()
    db_async.add(user)
    await db_async.commit()
    codes = await account_security.new_recovery_codes(
        db_async, user, "password123", pyotp.TOTP(user.totp_secret).now()
    )
    assert len(codes) == 8
    assert all(code not in user.mfa_recovery_hashes for code in codes)
    assert await account_security.verify_factor(db_async, user, codes[0])
    await db_async.commit()
    assert not await account_security.verify_factor(db_async, user, codes[0])
    assert len(user.mfa_recovery_hashes) == 7


async def test_session_revocation_is_owner_scoped(db_async: AsyncSession) -> None:
    user, other = await make_user(db_async), await make_user(db_async)
    target, _ = await service.create_session(session=db_async, user=other)
    with pytest.raises(AppException):
        await account_security.revoke_owned_session(db_async, user, target.id)
    await account_security.revoke_owned_session(db_async, other, target.id)
    assert target.revoked_at is not None


async def test_registration_profile_and_offboarding_api_journey(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    auth_emails: list[dict[str, str]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from urllib.parse import parse_qs, urlparse

    from src.email_config import email_settings

    monkeypatch.setattr(
        type(email_settings), "EMAILS_ENABLED", property(lambda _self: True)
    )
    actor = await make_user(db_async, superuser=True)
    admin_headers = {
        "Authorization": "Bearer " + create_access_token(actor.id, timedelta(minutes=5))
    }
    dept = await make_department(db_async)
    grade = Grade(
        id=dept.id + "_API",
        department_id=dept.id,
        code="API",
        label="API staff",
        rank=1,
    )
    db_async.add(grade)
    await db_async.commit()
    await make_role_with_permission(db_async, "hr.profile.read.self", role_name="staff")
    password = "api-journey-password"
    user_id = str(
        await make_self_signup_user(
            db_async,
            email="api.journey@example.com",
            username="apijourney",
            password=password,
            first_name="Journey",
            last_name="Employee",
        )
    )
    requested = await async_client.post(
        "/api/v1/auth/password/setup", json={"email": "api.journey@example.com"}
    )
    assert requested.status_code == 200
    await drain_setup_emails()
    setup_url = f"/api/v1/hr/setup/staff/{user_id}"
    approve_url = setup_url + "/approve-registration"
    assert (
        await async_client.post(approve_url, headers=admin_headers)
    ).status_code == 409
    assert (
        await async_client.put(
            setup_url,
            headers=admin_headers,
            json={
                "department_id": dept.id,
                "grade_id": grade.id,
                "mailbox_ready": True,
            },
        )
    ).status_code == 200
    message = next(
        item for item in auth_emails if item["email_to"] == "api.journey@example.com"
    )
    link = message["html_content"].split('href="', 1)[1].split('"', 1)[0]
    token = parse_qs(urlparse(link).query)["token"][0]
    verify_body = {"token": token, "new_password": password}
    assert (
        await async_client.post("/api/v1/auth/password/setup/confirm", json=verify_body)
    ).status_code == 200
    assert (
        await async_client.post("/api/v1/auth/password/setup/confirm", json=verify_body)
    ).status_code == 400
    login_body = {"email": "api.journey@example.com", "password": password}
    # Before approval: an account session (ADR-0017) that manages the account
    # but is refused by every staff route.
    pending = await async_client.post("/api/v1/auth/sessions", json=login_body)
    assert pending.status_code == 200
    pending_headers = {"Authorization": "Bearer " + pending.json()["access_token"]}
    assert (
        await async_client.get("/api/v1/auth/users/me", headers=pending_headers)
    ).status_code == 200
    assert (
        await async_client.get("/api/v1/hr/profile/me", headers=pending_headers)
    ).status_code == 403
    assert (
        await async_client.post(approve_url, headers=admin_headers)
    ).status_code == 200
    assert (
        await async_client.post(approve_url, headers=admin_headers)
    ).status_code == 409
    login = await async_client.post("/api/v1/auth/sessions", json=login_body)
    assert login.status_code == 200
    headers = {"Authorization": "Bearer " + login.json()["access_token"]}
    assert (await async_client.post(approve_url, headers=headers)).status_code == 403
    profile = await async_client.get("/api/v1/hr/profile/me", headers=headers)
    assert profile.status_code == 200
    assert profile.json()["id"] == user_id
    card = await async_client.get("/api/v1/hr/staff-card/me", headers=headers)
    assert card.status_code == 200
    assert card.json()["status"] == "active"
    number = card.json()["number"]
    updated = await async_client.patch(
        "/api/v1/hr/profile/me",
        headers=headers,
        json={"profile": {"first_name": "Updated", "phone": "+14735550100"}},
    )
    assert updated.status_code == 200
    card = await async_client.get("/api/v1/hr/staff-card/me", headers=headers)
    assert card.json()["name"] == "Updated Employee"
    assert card.json()["number"] == number
    assert (
        await async_client.post(setup_url + "/offboard", headers=admin_headers)
    ).status_code == 200
    assert (
        await async_client.get("/api/v1/hr/staff-card/me", headers=headers)
    ).status_code == 401
    assert (
        await async_client.post("/api/v1/auth/sessions", json=login_body)
    ).status_code == 400


async def test_mfa_recovery_and_disable_api_journey(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    secret = pyotp.random_base32()
    user.totp_enabled = True
    user.totp_secret = secret
    db_async.add(user)
    await db_async.commit()
    headers = {
        "Authorization": "Bearer " + create_access_token(user.id, timedelta(minutes=5))
    }
    proof = {"password": "password123", "code": pyotp.TOTP(secret).now()}
    codes_response = await async_client.post(
        "/api/v1/auth/users/me/security/recovery-codes", headers=headers, json=proof
    )
    assert codes_response.status_code == 200
    codes = codes_response.json()["codes"]
    body = {"email": user.email, "password": "password123", "totp_code": codes[0]}
    assert (
        await async_client.post("/api/v1/auth/sessions", json=body)
    ).status_code == 200
    assert (
        await async_client.post("/api/v1/auth/sessions", json=body)
    ).status_code == 400
    assert (
        await async_client.post(
            "/api/v1/auth/users/me/security/2fa/disable",
            headers=headers,
            json={"password": "password123"},
        )
    ).status_code == 422
    assert (
        await async_client.post(
            "/api/v1/auth/users/me/security/2fa/disable",
            headers=headers,
            json={"password": "password123", "code": codes[1]},
        )
    ).status_code == 200
    await db_async.refresh(user)
    assert not user.totp_enabled
    assert user.mfa_recovery_hashes == []


@pytest.mark.usefixtures("db_async")
async def test_account_with_rewards_history_can_be_deleted(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """Issue #1375: DELETE /auth/users/me must succeed for a customer who holds
    a rewards ledger entry (the ledger refuses DELETE by trigger, and the
    account-referencing rewards tables have no ON DELETE rule)."""
    customer = await make_user(db_async)
    owner = await make_user(db_async)
    org = await make_org(
        db_async,
        "Deletion Cafe",
        members=((owner, MembershipRole.OWNER),),
        apps=("rewards",),
    )
    await rewards_service.create_program(
        db_async,
        organisation_id=org.id,
        actor=owner,
        payload=ProgramCreate(
            name="Coffee card",
            stamps_required=5,
            reward_description="A free coffee",
        ),
    )
    await rewards_service.record_qualifying_action(
        db_async,
        source_type=rewards_service.EVENTS_ADMISSION,
        source_id=f"deletion-{uuid.uuid4().hex[:8]}",
        organisation_id=org.id,
        user_id=customer.id,
    )
    await db_async.commit()

    login_body = {"email": customer.email, "password": "password123"}
    login = await async_client.post("/api/v1/auth/sessions", json=login_body)
    assert login.status_code == 200
    headers = {"Authorization": "Bearer " + login.json()["access_token"]}

    deleted = await async_client.delete("/api/v1/auth/users/me", headers=headers)
    assert 200 <= deleted.status_code < 300, deleted.text

    after = await async_client.post("/api/v1/auth/sessions", json=login_body)
    assert after.status_code == 400
