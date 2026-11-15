"""Superuser status moves only through invitations (ADR-0059 rule 1).

The generic create and update routes never grant it. Removing it needs a superuser
with an authenticator and a two-step sign-in, is audited, is announced to the other
superusers (placeholder and unverified addresses are skipped), and closes the removed
account's open invitations. Start-up creation and the first-superuser script use the
service layer and keep working.
"""

import uuid

import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from scripts import grant_superuser
from src.audit.models import AuditEntry
from src.auth import service, totp
from src.auth import superuser_invitation as invitations
from src.auth.config import auth_settings
from src.auth.models import Permission, Role, SuperuserInvitation, User
from src.auth.placeholders import placeholder_email
from src.config import settings
from src.database import init_db_async
from src.notifications.models import OutboundEmail
from src.utils.datetime import utc_now
from tests.factories import make_user

BASE = "/api/v1/auth/users"
NEW_EMAIL = "would.be.superuser@example.org"
REASON = "Operations lead for the platform, approved by the owner"
REVOKED_TITLE = "Superuser access removed"


@pytest.fixture(autouse=True)
def encryption(monkeypatch):
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "disabled")
    monkeypatch.setattr(settings, "FRONTEND_HOST", "https://auth.example.test")


async def account_headers(db: AsyncSession, user: User, *, mfa: bool) -> dict[str, str]:
    db_session, _ = await service.create_session(
        session=db,
        user=user,
        client_type="web",
        app_name="auth",
        mfa_verified_at=utc_now() if mfa else None,
    )
    token, _ = service.issue_access_token_for_user(
        user=user,
        expires_delta=service.get_session_access_token_expires_delta(),
        db_session=db_session,
    )
    return {"Authorization": f"Bearer {token}"}


async def superuser_headers(
    db: AsyncSession, *, authenticator: bool = True, mfa: bool = True
) -> tuple[User, dict[str, str]]:
    """A superuser; ``authenticator`` enrols one and ``mfa`` marks a two-step sign-in."""
    user = await make_user(db, superuser=True)
    if authenticator:
        user.totp_enabled = True
        user.totp_secret = totp.encrypt_secret(pyotp.random_base32())
        db.add(user)
        await db.commit()
    return user, await account_headers(db, user, mfa=mfa)


async def manager_headers(db: AsyncSession) -> tuple[User, dict[str, str]]:
    """A non-superuser who holds user.manage through a role."""
    user = await make_user(db)
    permission = await db.scalar(
        select(Permission).where(Permission.key == "user.manage")
    )
    if permission is None:
        permission = Permission(
            key="user.manage",
            action="manage",
            entity="user",
            access="all",
            description="Manage user accounts",
        )
    role = Role(name=f"UM_{uuid.uuid4().hex[:10].upper()}")
    role.permissions.append(permission)
    user.roles.append(role)
    db.add_all([role, user])
    await db.commit()
    return user, await account_headers(db, user, mfa=True)


async def patch_superuser(client, headers, user_id, value):
    return await client.patch(
        f"{BASE}/{user_id}", headers=headers, json={"is_superuser": value}
    )


async def superuser_rows(db: AsyncSession, user: User) -> list[AuditEntry]:
    return list(
        (
            await db.execute(
                select(AuditEntry).where(
                    AuditEntry.action == "superuser_revoked",
                    AuditEntry.record_id == str(user.id),
                )
            )
        )
        .scalars()
        .all()
    )


async def notices_to(db: AsyncSession, user: User) -> list[OutboundEmail]:
    return list(
        (
            await db.execute(
                select(OutboundEmail).where(
                    OutboundEmail.to_email == user.email,
                    OutboundEmail.template == "notification",
                )
            )
        )
        .scalars()
        .all()
    )


async def deactivate_all_superusers(db: AsyncSession) -> None:
    """The seeded first superuser is active in every test; park it so the test
    controls who is the last active superuser."""
    await db.execute(
        update(User).where(User.is_superuser.is_(True)).values(is_active=False)
    )
    await db.commit()


# --- Promotion is refused on every generic route -----------------------------


@pytest.mark.parametrize(
    ("authenticator", "mfa"),
    [(False, False), (False, True), (True, False), (True, True)],
)
async def test_patch_refuses_promotion_whatever_the_mfa_state(
    async_client, db_async: AsyncSession, authenticator: bool, mfa: bool
) -> None:
    _, headers = await superuser_headers(db_async, authenticator=authenticator, mfa=mfa)
    target = await make_user(db_async)
    response = await patch_superuser(async_client, headers, target.id, True)
    assert response.status_code == 403
    assert "invitation" in response.json()["detail"]
    await db_async.refresh(target)
    assert target.is_superuser is False


@pytest.mark.parametrize(
    ("authenticator", "mfa"),
    [(False, False), (False, True), (True, False), (True, True)],
)
async def test_post_refuses_promotion_whatever_the_mfa_state(
    async_client, db_async: AsyncSession, authenticator: bool, mfa: bool
) -> None:
    _, headers = await superuser_headers(db_async, authenticator=authenticator, mfa=mfa)
    response = await async_client.post(
        BASE,
        headers=headers,
        json={
            "email": NEW_EMAIL,
            "username": "would_be_superuser",
            "password": "password123",
            "first_name": "New",
            "last_name": "Admin",
            "is_superuser": True,
        },
    )
    assert response.status_code == 403
    assert "invitation" in response.json()["detail"]
    assert await db_async.scalar(select(User).where(User.email == NEW_EMAIL)) is None


async def test_manager_who_is_not_a_superuser_cannot_promote_or_demote(
    async_client, db_async: AsyncSession
) -> None:
    _, headers = await manager_headers(db_async)
    target = await make_user(db_async)
    promoted = await patch_superuser(async_client, headers, target.id, True)
    assert promoted.status_code == 403
    demoted = await patch_superuser(async_client, headers, target.id, False)
    assert demoted.status_code == 403
    created = await async_client.post(
        BASE,
        headers=headers,
        json={
            "email": NEW_EMAIL,
            "username": "manager_created",
            "password": "password123",
            "first_name": "New",
            "last_name": "Admin",
            "is_superuser": True,
        },
    )
    assert created.status_code == 403
    assert await db_async.scalar(select(User).where(User.email == NEW_EMAIL)) is None


async def test_null_superuser_flag_is_refused_not_stored(
    async_client, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    target = await make_user(db_async, superuser=True)
    response = await async_client.patch(
        f"{BASE}/{target.id}", headers=headers, json={"is_superuser": None}
    )
    assert response.status_code == 422
    await db_async.refresh(target)
    assert target.is_superuser is True


# --- Demotion needs an authenticator and a two-step sign-in ------------------


async def test_demotion_with_mfa_is_allowed_audited_and_announced(
    async_client, db_async: AsyncSession
) -> None:
    actor, headers = await superuser_headers(db_async)
    target = await make_user(db_async, superuser=True)
    other = await make_user(db_async, superuser=True)
    unverified = await make_user(db_async, superuser=True, verified=False)
    placeholder = await make_user(db_async, superuser=True)
    placeholder.email = placeholder_email("aaaaaaaaaaaa")
    await db_async.commit()

    response = await patch_superuser(async_client, headers, target.id, False)

    assert response.status_code == 200
    assert response.json()["is_superuser"] is False
    await db_async.refresh(target)
    assert target.is_superuser is False

    rows = await superuser_rows(db_async, target)
    assert len(rows) == 1
    assert rows[0].actor_user_id == actor.id
    fields = {change["field"]: change["new"] for change in rows[0].changes}
    assert fields["actor_user_id"] == str(actor.id)
    assert fields["target_user_id"] == str(target.id)

    # The other verified superuser hears about it; the actor, the removed account,
    # an unverified address and a placeholder address do not.
    notices = await notices_to(db_async, other)
    assert [row.props["title"] for row in notices] == [REVOKED_TITLE]
    assert await notices_to(db_async, unverified) == []
    assert await notices_to(db_async, placeholder) == []
    assert await notices_to(db_async, actor) == []
    assert await notices_to(db_async, target) == []


@pytest.mark.parametrize(
    ("authenticator", "mfa"), [(False, True), (True, False), (False, False)]
)
async def test_demotion_without_authenticator_and_two_step_is_refused(
    async_client, db_async: AsyncSession, authenticator: bool, mfa: bool
) -> None:
    _, headers = await superuser_headers(db_async, authenticator=authenticator, mfa=mfa)
    target = await make_user(db_async, superuser=True)
    response = await patch_superuser(async_client, headers, target.id, False)
    assert response.status_code == 403
    await db_async.refresh(target)
    assert target.is_superuser is True
    assert await superuser_rows(db_async, target) == []


async def test_last_active_superuser_cannot_remove_own_access(
    async_client, db_async: AsyncSession
) -> None:
    await deactivate_all_superusers(db_async)
    actor, headers = await superuser_headers(db_async)
    response = await patch_superuser(async_client, headers, actor.id, False)
    assert response.status_code == 409
    await db_async.refresh(actor)
    assert actor.is_superuser is True
    assert await superuser_rows(db_async, actor) == []


async def test_superuser_may_remove_own_access_when_another_remains(
    async_client, db_async: AsyncSession
) -> None:
    await deactivate_all_superusers(db_async)
    actor, headers = await superuser_headers(db_async)
    await make_user(db_async, superuser=True)
    response = await patch_superuser(async_client, headers, actor.id, False)
    assert response.status_code == 200
    await db_async.refresh(actor)
    assert actor.is_superuser is False


async def test_removing_a_superuser_closes_their_open_invitations(
    async_client, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    inviter = await make_user(db_async, superuser=True)
    invitation = await invitations.create_invitation(
        db_async, inviter=inviter, email="invitee@example.org", reason=REASON
    )
    await db_async.commit()

    response = await patch_superuser(async_client, headers, inviter.id, False)
    assert response.status_code == 200

    await db_async.refresh(invitation)
    assert invitation.revoked_at is not None
    assert invitation.accepted_at is None
    row = await db_async.get(SuperuserInvitation, invitation.id)
    assert row is not None and row.revoked_at is not None


async def test_edits_that_do_not_touch_superuser_status_are_unchanged(
    async_client, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async, mfa=False)
    target = await make_user(db_async)
    response = await async_client.patch(
        f"{BASE}/{target.id}", headers=headers, json={"first_name": "Corrected"}
    )
    assert response.status_code == 200
    assert response.json()["first_name"] == "Corrected"


# --- Start-up creation and the first-superuser script are unaffected ---------


async def test_start_up_creation_and_first_superuser_script_still_work(
    db_async: AsyncSession,
) -> None:
    # db_async ran init_db_async, which created the configured first superuser.
    first = await db_async.scalar(
        select(User).where(
            func.lower(User.email) == str(settings.FIRST_SUPERUSER).lower()
        )
    )
    assert first is not None and first.is_superuser is True
    await init_db_async(db_async)  # idempotent: no second first superuser
    count = await db_async.scalar(
        select(func.count(User.id)).where(User.email == str(settings.FIRST_SUPERUSER))
    )
    assert count == 1

    # The script's path: an empty system, then a verified account is granted.
    await deactivate_all_superusers(db_async)
    founder = await make_user(db_async, email="founder-script@example.org")
    plan = await grant_superuser.grant_first_superuser(
        db_async, email="founder-script@example.org", apply=True
    )
    assert plan.ready is True
    await db_async.refresh(founder)
    assert founder.is_superuser is True
