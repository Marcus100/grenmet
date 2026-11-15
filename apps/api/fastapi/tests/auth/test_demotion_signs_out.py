"""Removing superuser status ends the demoted account's sessions (#1481, part 2).

``superuser_invitation.demote_superuser`` deletes every login session of the removed
account (browser, CMS and account sessions alike) in the same transaction as the grant
removal. Their session secrets can no longer be rotated, so the account must sign in
again. Other accounts keep theirs. The ids of the ended sessions go into the one
``superuser_revoked`` audit row; no secret or personal data is written. Superuser power
is read from the database on every request, so the demoted account loses it at once.
"""

import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import service, totp
from src.auth.config import auth_settings
from src.auth.models import Session as LoginSession
from src.auth.models import User
from src.config import settings
from src.utils.datetime import utc_now
from tests.factories import make_user

BASE = "/api/v1/auth/users"
REFRESH = "/api/v1/auth/sessions/refresh"


@pytest.fixture(autouse=True)
def encryption(monkeypatch):
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "disabled")
    monkeypatch.setattr(settings, "FRONTEND_HOST", "https://auth.example.test")


async def make_session(
    db: AsyncSession, user: User, *, app_name: str = "auth", mfa: bool = False
) -> tuple[str, str]:
    """A persisted session: its id and the opaque secret the client rotates."""
    db_session, token = await service.create_session(
        session=db,
        user=user,
        client_type="web",
        app_name=app_name,
        mfa_verified_at=utc_now() if mfa else None,
    )
    await db.commit()
    return str(db_session.id), token


async def bearer_for(db: AsyncSession, user: User) -> dict[str, str]:
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
    await db.commit()
    return {"Authorization": f"Bearer {token}"}


async def superuser_headers(db: AsyncSession) -> tuple[User, dict[str, str], str]:
    """An active superuser with an authenticator and a two-step sign-in, plus the
    session secret of that sign-in."""
    user = await make_user(db, superuser=True)
    user.totp_enabled = True
    user.totp_secret = totp.encrypt_secret(pyotp.random_base32())
    db.add(user)
    await db.commit()
    db_session, secret = await service.create_session(
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
    await db.commit()
    return user, {"Authorization": f"Bearer {token}"}, secret


async def is_active(db: AsyncSession, secret: str) -> bool:
    """Read-only: whether the secret still names an active session. Refreshing would
    rotate the secret, so the checks before a change use this instead."""
    return (
        await service.get_active_session_by_secret(session=db, session_secret=secret)
    ) is not None


async def rotates(client, secret: str) -> bool:
    """Whether the secret can still be rotated over HTTP (a successful call rotates it,
    so call it last)."""
    response = await client.post(REFRESH, json={"session_token": secret})
    return response.status_code == 200


async def session_count(db: AsyncSession, user: User) -> int:
    return int(
        await db.scalar(
            select(func.count(LoginSession.id)).where(LoginSession.user_id == user.id)
        )
        or 0
    )


async def demotion_rows(db: AsyncSession, user: User) -> list[AuditEntry]:
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


async def test_demotion_ends_every_session_of_the_demoted_account(
    async_client, db_async: AsyncSession
) -> None:
    _, headers, _ = await superuser_headers(db_async)
    target = await make_user(db_async, superuser=True)
    _, first = await make_session(db_async, target)
    _, second = await make_session(db_async, target)
    _, cms = await make_session(db_async, target, app_name="cms")
    assert await is_active(db_async, first)
    assert await is_active(db_async, cms)

    response = await async_client.patch(
        f"{BASE}/{target.id}", headers=headers, json={"is_superuser": False}
    )

    assert response.status_code == 200
    assert await session_count(db_async, target) == 0
    assert not await is_active(db_async, first)
    assert not await is_active(db_async, second)
    assert not await is_active(db_async, cms)
    assert not await rotates(async_client, first)
    assert not await rotates(async_client, cms)


async def test_demotion_leaves_other_accounts_sessions_alone(
    async_client, db_async: AsyncSession
) -> None:
    _, headers, _ = await superuser_headers(db_async)
    target = await make_user(db_async, superuser=True)
    other_superuser = await make_user(db_async, superuser=True)
    ordinary = await make_user(db_async)
    _, target_secret = await make_session(db_async, target)
    _, other_secret = await make_session(db_async, other_superuser)
    _, ordinary_secret = await make_session(db_async, ordinary)

    response = await async_client.patch(
        f"{BASE}/{target.id}", headers=headers, json={"is_superuser": False}
    )

    assert response.status_code == 200
    assert await session_count(db_async, other_superuser) == 1
    assert await session_count(db_async, ordinary) == 1
    assert not await is_active(db_async, target_secret)
    assert await is_active(db_async, other_secret)
    assert await is_active(db_async, ordinary_secret)


async def test_self_demotion_ends_the_callers_own_session(
    async_client, db_async: AsyncSession
) -> None:
    actor, headers, actor_secret = await superuser_headers(db_async)
    await make_user(db_async, superuser=True)  # another active superuser remains

    response = await async_client.patch(
        f"{BASE}/{actor.id}", headers=headers, json={"is_superuser": False}
    )

    assert response.status_code == 200
    assert response.json()["is_superuser"] is False
    assert await session_count(db_async, actor) == 0
    assert not await is_active(db_async, actor_secret)
    assert not await rotates(async_client, actor_secret)


async def test_refused_demotion_keeps_the_sessions(
    async_client, db_async: AsyncSession
) -> None:
    # The actor has no two-step sign-in, so the request is refused before any change.
    actor = await make_user(db_async, superuser=True)
    headers = await bearer_for(db_async, actor)
    target = await make_user(db_async, superuser=True)
    _, target_secret = await make_session(db_async, target)

    response = await async_client.patch(
        f"{BASE}/{target.id}", headers=headers, json={"is_superuser": False}
    )

    assert response.status_code == 403
    await db_async.refresh(target)
    assert target.is_superuser is True
    assert await is_active(db_async, target_secret)


async def test_edit_of_an_ordinary_account_does_not_touch_its_sessions(
    async_client, db_async: AsyncSession
) -> None:
    _, headers, _ = await superuser_headers(db_async)
    ordinary = await make_user(db_async)
    _, secret = await make_session(db_async, ordinary)

    response = await async_client.patch(
        f"{BASE}/{ordinary.id}", headers=headers, json={"is_superuser": False}
    )

    assert response.status_code == 200
    assert await is_active(db_async, secret)


async def test_demoted_account_loses_superuser_power_at_once(
    async_client, db_async: AsyncSession
) -> None:
    demoted, demoted_headers, _ = await superuser_headers(db_async)
    _, actor_headers, _ = await superuser_headers(db_async)
    victim = await make_user(db_async)

    await async_client.patch(
        f"{BASE}/{demoted.id}", headers=actor_headers, json={"is_superuser": False}
    )
    # The demoted account's earlier bearer token no longer manages other accounts.
    response = await async_client.patch(
        f"{BASE}/{victim.id}", headers=demoted_headers, json={"first_name": "Changed"}
    )

    assert response.status_code == 403


async def test_audit_row_names_the_ended_session_ids_only(
    async_client, db_async: AsyncSession
) -> None:
    actor, headers, _ = await superuser_headers(db_async)
    target = await make_user(db_async, superuser=True)
    first_id, first = await make_session(db_async, target)
    second_id, _ = await make_session(db_async, target)
    cms_id, _ = await make_session(db_async, target, app_name="cms")

    response = await async_client.patch(
        f"{BASE}/{target.id}", headers=headers, json={"is_superuser": False}
    )

    assert response.status_code == 200
    rows = await demotion_rows(db_async, target)
    assert len(rows) == 1
    assert rows[0].actor_user_id == actor.id
    changes = {change["field"]: change for change in rows[0].changes}
    ended = changes["sessions_ended"]
    assert sorted(ended["new"]) == sorted([first_id, second_id, cms_id])
    assert ended["old"] is None
    assert ended["sensitive"] is False
    # Ids only: no session secret, and the rest of the row is unchanged.
    assert first not in str(rows[0].changes)
    assert changes["is_superuser"]["old"] is True
    assert changes["is_superuser"]["new"] is False
