"""HR offboarding of a superuser (#1491).

``POST /hr/setup/staff/{id}/offboard`` needs ``hr.setup.manage``, which an HR manager
holds for their own organisation. That key must not be enough to deactivate a
superuser: the same change through ``PATCH /auth/users/{id}`` is refused. Offboarding
a superuser needs a superuser whose session passed two-step sign-in. The last-superuser
conflict on this route uses generic wording, not the auth route's message.
"""

import uuid

import pyotp
import pytest
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service, totp
from src.auth import superuser_invitation as invitations
from src.auth.config import auth_settings
from src.auth.exceptions import LastSuperuserError
from src.auth.models import RoleAssignmentScope, User
from src.baseline.models import StaffCredential
from src.hr.models import Grade
from src.utils.datetime import utc_now
from tests.factories import (
    assign_role,
    make_department,
    make_role_with_permission,
    make_user,
)

SETUP_KEY = "hr.setup.manage"
OWN_ORG = "gaa"
OWN_DEPT = "dept_offboard_super"
OWN_GRADE = "GRADE_OFFBOARD_SUPER"
GENERIC_CONFLICT = "Offboarding conflicts with the current account state. Ask an administrator to review it."
SPECIFIC_AUTH_CONFLICT = "At least one other active superuser must remain"


@pytest.fixture(autouse=True)
def encryption(monkeypatch):
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "disabled")


async def _headers(
    db: AsyncSession, user: User, *, mfa_verified: bool
) -> dict[str, str]:
    db_session, _ = await service.create_session(
        session=db,
        user=user,
        client_type="web",
        app_name="auth",
        mfa_verified_at=utc_now() if mfa_verified else None,
    )
    token, _ = service.issue_access_token_for_user(
        user=user,
        expires_delta=service.get_session_access_token_expires_delta(),
        db_session=db_session,
    )
    return {"Authorization": f"Bearer {token}"}


async def _superuser(db: AsyncSession, *, authenticator: bool = True) -> User:
    user = await make_user(db, superuser=True)
    if authenticator:
        user.totp_enabled = True
        user.totp_secret = totp.encrypt_secret(pyotp.random_base32())
        db.add(user)
        await db.commit()
    return user


async def _park_other_superusers(db: AsyncSession, keep: list[uuid.UUID]) -> None:
    await db.execute(
        update(User)
        .where(User.is_superuser.is_(True), User.id.not_in(keep))
        .values(is_active=False)
    )
    await db.commit()


async def _hr_admin(db: AsyncSession) -> User:
    """A non-superuser holding hr.setup.manage across the organisation."""
    admin = await make_user(db)
    role, _ = await make_role_with_permission(db, SETUP_KEY)
    await assign_role(
        db,
        user=admin,
        role=role,
        scope=RoleAssignmentScope.ALL,
        organisation_id=OWN_ORG,
    )
    return admin


async def _staff_with_credential(db: AsyncSession, user: User) -> None:
    if not await db.get(Grade, OWN_GRADE):
        await make_department(db, OWN_DEPT, organisation_id=OWN_ORG)
        db.add(
            Grade(id=OWN_GRADE, department_id=OWN_DEPT, code="OWN", label="Own", rank=1)
        )
        await db.flush()
    db.add(
        StaffCredential(
            user_id=user.id,
            department_id=OWN_DEPT,
            grade_id=OWN_GRADE,
            number=f"OFF-{user.id.hex[:6]}",
        )
    )
    await db.commit()


def _url(user_id: uuid.UUID) -> str:
    return f"/api/v1/hr/setup/staff/{user_id}/offboard"


async def test_hr_manager_cannot_offboard_a_superuser(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    admin = await _hr_admin(db_async)
    headers = await _headers(db_async, admin, mfa_verified=False)
    target = await _superuser(db_async)
    other = await _superuser(db_async)
    await _staff_with_credential(db_async, target)
    await _park_other_superusers(db_async, keep=[target.id, other.id])

    response = await async_client.post(_url(target.id), headers=headers)

    assert response.status_code == 403, response.text
    assert response.json()["detail"] == "Only a superuser can do this"
    await db_async.refresh(target)
    assert target.is_active is True


async def test_superuser_without_two_step_session_cannot_offboard_a_superuser(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    actor = await _superuser(db_async)
    headers = await _headers(db_async, actor, mfa_verified=False)
    target = await _superuser(db_async)
    await _staff_with_credential(db_async, target)
    await _park_other_superusers(db_async, keep=[actor.id, target.id])

    response = await async_client.post(_url(target.id), headers=headers)

    assert response.status_code == 403, response.text
    await db_async.refresh(target)
    assert target.is_active is True


async def test_superuser_without_authenticator_cannot_offboard_a_superuser(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    actor = await _superuser(db_async, authenticator=False)
    headers = await _headers(db_async, actor, mfa_verified=True)
    target = await _superuser(db_async)
    await _staff_with_credential(db_async, target)
    await _park_other_superusers(db_async, keep=[actor.id, target.id])

    response = await async_client.post(_url(target.id), headers=headers)

    assert response.status_code == 403, response.text
    await db_async.refresh(target)
    assert target.is_active is True


async def test_two_step_superuser_may_offboard_another_superuser(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    actor = await _superuser(db_async)
    headers = await _headers(db_async, actor, mfa_verified=True)
    target = await _superuser(db_async)
    await _staff_with_credential(db_async, target)
    await _park_other_superusers(db_async, keep=[actor.id, target.id])

    response = await async_client.post(_url(target.id), headers=headers)

    assert response.status_code == 200, response.text
    await db_async.refresh(target)
    assert target.is_active is False


async def test_hr_manager_still_offboards_ordinary_staff(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    admin = await _hr_admin(db_async)
    headers = await _headers(db_async, admin, mfa_verified=False)
    person = await make_user(db_async)
    await _staff_with_credential(db_async, person)

    response = await async_client.post(_url(person.id), headers=headers)

    assert response.status_code == 200, response.text
    await db_async.refresh(person)
    assert person.is_active is False


async def test_hr_route_uses_generic_text_for_last_superuser_conflict(
    async_client: AsyncClient, db_async: AsyncSession, monkeypatch
) -> None:
    """A two-step superuser reaches the guard. The guard's specific auth-route text
    must not leak through the HR route, so the route maps it to generic wording."""
    actor = await _superuser(db_async)
    headers = await _headers(db_async, actor, mfa_verified=True)
    target = await _superuser(db_async)
    await _staff_with_credential(db_async, target)
    await _park_other_superusers(db_async, keep=[actor.id, target.id])

    async def refuse(*_args: object, **_kwargs: object) -> None:  # forced error path
        raise LastSuperuserError()

    monkeypatch.setattr(invitations, "guard_last_superuser", refuse)

    response = await async_client.post(_url(target.id), headers=headers)

    assert response.status_code == 409, response.text
    detail = response.json()["detail"]
    assert detail == GENERIC_CONFLICT
    assert "superuser" not in detail.lower()
    assert "only" not in detail.lower()
    assert "invite" not in detail.lower()
    await db_async.refresh(target)
    assert target.is_active is True


async def test_auth_route_keeps_specific_last_superuser_message(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    actor = await _superuser(db_async)
    headers = await _headers(db_async, actor, mfa_verified=True)
    await _park_other_superusers(db_async, keep=[actor.id])

    response = await async_client.patch(
        f"/api/v1/auth/users/{actor.id}", headers=headers, json={"is_active": False}
    )

    assert response.status_code == 409, response.text
    assert SPECIFIC_AUTH_CONFLICT in response.json()["detail"]
