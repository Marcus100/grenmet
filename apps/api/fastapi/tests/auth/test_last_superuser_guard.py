"""The last active superuser cannot be deactivated, deleted or left without access (#1481).

``demote_superuser`` already refuses to remove the last active superuser. Deactivation
(``PATCH /auth/users/{id}`` with ``is_active: false``), anonymisation
(``DELETE /auth/users/{id}`` and the service behind it) and HR offboarding
(``POST /hr/setup/staff/{id}/offboard``) take the same lock and check through
``superuser_invitation.guard_last_superuser``. Non-superuser targets are unaffected.
"""

import asyncio
import uuid

import pyotp
import pytest
from cryptography.fernet import Fernet
from httpx import AsyncClient
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service, totp
from src.auth.config import auth_settings
from src.auth.exceptions import LastSuperuserError
from src.auth.models import RoleAssignmentScope, User
from src.auth.schemas import UserUpdate
from src.baseline.models import StaffCredential
from src.config import settings
from src.database import async_session_factory
from src.hr.models import Grade
from src.utils.datetime import utc_now
from tests.factories import (
    assign_role,
    make_department,
    make_role_with_permission,
    make_user,
)

BASE = "/api/v1/auth/users"
ME_DELETE = "/api/v1/auth/users/me"
OWN_ORG = "gaa"
OWN_DEPT = "dept_lastsuper_own"
OWN_GRADE = "GRADE_LASTSUPER_OWN"
SETUP_KEY = "hr.setup.manage"


@pytest.fixture(autouse=True)
def encryption(monkeypatch):
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "disabled")
    monkeypatch.setattr(settings, "FRONTEND_HOST", "https://auth.example.test")


async def account_headers(db: AsyncSession, user: User) -> dict[str, str]:
    db_session, _ = await service.create_session(
        session=db,
        user=user,
        client_type="web",
        app_name="auth",
        mfa_verified_at=utc_now(),
    )
    token, _ = service.issue_access_token_for_user(
        user=user,
        expires_delta=service.get_session_access_token_expires_delta(),
        db_session=db_session,
    )
    return {"Authorization": f"Bearer {token}"}


async def superuser_headers(db: AsyncSession) -> tuple[User, dict[str, str]]:
    """A superuser with an enrolled authenticator and a two-step sign-in."""
    user = await make_user(db, superuser=True)
    user.totp_enabled = True
    user.totp_secret = totp.encrypt_secret(pyotp.random_base32())
    db.add(user)
    await db.commit()
    return user, await account_headers(db, user)


async def park_other_superusers(db: AsyncSession, keep: list[uuid.UUID]) -> None:
    """The seeded first superuser is active in every test. Park every superuser
    outside ``keep`` so each test decides who is the last active one."""
    await db.execute(
        update(User)
        .where(User.is_superuser.is_(True), User.id.not_in(keep))
        .values(is_active=False)
    )
    await db.commit()


async def active_superuser_ids(db: AsyncSession) -> set[uuid.UUID]:
    rows = await db.scalars(
        select(User.id).where(User.is_superuser.is_(True), User.is_active.is_(True))
    )
    return set(rows.all())


# Deactivation through PATCH


async def test_last_superuser_cannot_deactivate_self(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    actor, headers = await superuser_headers(db_async)
    await park_other_superusers(db_async, keep=[actor.id])

    response = await async_client.patch(
        f"{BASE}/{actor.id}", headers=headers, json={"is_active": False}
    )

    assert response.status_code == 409
    await db_async.refresh(actor)
    assert actor.is_active is True


async def test_superuser_may_deactivate_another_when_one_remains(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    actor, headers = await superuser_headers(db_async)
    other = await make_user(db_async, superuser=True)
    await park_other_superusers(db_async, keep=[actor.id, other.id])

    response = await async_client.patch(
        f"{BASE}/{other.id}", headers=headers, json={"is_active": False}
    )

    assert response.status_code == 200, response.text
    await db_async.refresh(other)
    assert other.is_active is False


async def test_superuser_may_deactivate_self_when_another_remains(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    actor, headers = await superuser_headers(db_async)
    other = await make_user(db_async, superuser=True)
    await park_other_superusers(db_async, keep=[actor.id, other.id])

    response = await async_client.patch(
        f"{BASE}/{actor.id}", headers=headers, json={"is_active": False}
    )

    assert response.status_code == 200, response.text
    assert await active_superuser_ids(db_async) == {other.id}


async def test_deactivating_a_non_superuser_is_unaffected(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    actor, headers = await superuser_headers(db_async)
    await park_other_superusers(db_async, keep=[actor.id])
    person = await make_user(db_async)

    response = await async_client.patch(
        f"{BASE}/{person.id}", headers=headers, json={"is_active": False}
    )

    assert response.status_code == 200, response.text
    await db_async.refresh(person)
    assert person.is_active is False


# Anonymised deletion


async def test_last_superuser_cannot_be_deleted_by_the_service(
    db_async: AsyncSession,
) -> None:
    last = await make_user(db_async, superuser=True)
    await park_other_superusers(db_async, keep=[last.id])
    original_email = last.email

    with pytest.raises(LastSuperuserError):
        await service.delete_user(session=db_async, user=last)

    await db_async.rollback()
    await db_async.refresh(last)
    assert last.is_active is True
    assert last.is_superuser is True
    assert last.email == original_email


async def test_superuser_self_deletion_is_refused_on_both_routes(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    actor, headers = await superuser_headers(db_async)
    await park_other_superusers(db_async, keep=[actor.id])

    me = await async_client.delete(ME_DELETE, headers=headers)
    by_id = await async_client.delete(f"{BASE}/{actor.id}", headers=headers)

    assert me.status_code == 403
    assert by_id.status_code == 403
    await db_async.refresh(actor)
    assert actor.is_active is True


async def test_superuser_may_delete_another_when_one_remains(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    actor, headers = await superuser_headers(db_async)
    other = await make_user(db_async, superuser=True)
    await park_other_superusers(db_async, keep=[actor.id, other.id])

    response = await async_client.delete(f"{BASE}/{other.id}", headers=headers)

    assert response.status_code == 200, response.text
    await db_async.refresh(other)
    assert other.is_active is False
    assert other.is_superuser is False


async def test_deleting_a_non_superuser_is_unaffected(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    actor, headers = await superuser_headers(db_async)
    await park_other_superusers(db_async, keep=[actor.id])
    person = await make_user(db_async)

    response = await async_client.delete(f"{BASE}/{person.id}", headers=headers)

    assert response.status_code == 200, response.text
    await db_async.refresh(person)
    assert person.is_active is False


# HR offboarding


async def _hr_admin(db: AsyncSession) -> tuple[User, dict[str, str]]:
    """A non-superuser holding hr.setup.manage for the organisation."""
    admin = await make_user(db)
    role, _ = await make_role_with_permission(db, SETUP_KEY)
    await assign_role(
        db,
        user=admin,
        role=role,
        scope=RoleAssignmentScope.ALL,
        organisation_id=OWN_ORG,
    )
    return admin, await account_headers(db, admin)


async def test_hr_offboarding_refuses_the_last_superuser(
    async_client: AsyncClient, db_async: AsyncSession
) -> None:
    await make_department(db_async, OWN_DEPT, organisation_id=OWN_ORG)
    db_async.add(
        Grade(id=OWN_GRADE, department_id=OWN_DEPT, code="OWN", label="Own", rank=1)
    )
    last = await make_user(db_async, superuser=True)
    db_async.add(
        StaffCredential(
            user_id=last.id,
            department_id=OWN_DEPT,
            grade_id=OWN_GRADE,
            number="LS-1",
        )
    )
    await db_async.commit()
    await park_other_superusers(db_async, keep=[last.id])
    _, headers = await _hr_admin(db_async)

    response = await async_client.post(
        f"/api/v1/hr/setup/staff/{last.id}/offboard", headers=headers
    )

    assert response.status_code == 409, response.text
    await db_async.refresh(last)
    assert last.is_active is True


# Two administrators acting at once


async def test_two_superusers_deactivating_each_other_leave_one_active(
    db_async: AsyncSession,
) -> None:
    """Both requests run on their own session and connection. The row locks taken in
    id order serialise them, so the second sees only itself and is refused. Without
    the lock both commits would land and nobody would stay active."""
    first = await make_user(db_async, superuser=True)
    second = await make_user(db_async, superuser=True)
    await park_other_superusers(db_async, keep=[first.id, second.id])

    async def deactivate(target_id: uuid.UUID) -> str:
        async with async_session_factory() as session:
            target = await session.get(User, target_id)
            assert target is not None
            try:
                await service.update_user(
                    session=session,
                    db_user=target,
                    user_in=UserUpdate(is_active=False),
                )
            except LastSuperuserError:
                return "refused"
            return "done"

    outcomes = await asyncio.gather(deactivate(first.id), deactivate(second.id))

    assert sorted(outcomes) == ["done", "refused"]
    assert len(await active_superuser_ids(db_async)) == 1
