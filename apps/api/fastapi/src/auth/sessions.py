"""Browser sessions and access-token issuing."""

import uuid
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.apps import is_app_scoped, is_registered
from src.auth.config import auth_settings
from src.auth.eligibility import (
    is_eligible_for_app,
    is_staff_eligible,
    require_approved_account,
)
from src.auth.models import Session as AuthSession
from src.auth.models import (
    User,
)
from src.auth.schemas import (
    SessionCreate,
)
from src.auth.user_queries import get_user_by_id
from src.auth.utils import (
    create_access_token,
    create_session_token,
    hash_session_token,
)
from src.exceptions import AppException
from src.utils.datetime import utc_now


def get_legacy_access_token_expires_delta() -> timedelta:
    """Get the existing access-token TTL used by direct-token clients."""
    return timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES)


def get_session_access_token_expires_delta() -> timedelta:
    """Get the short-lived access-token TTL used by session-backed clients."""
    return timedelta(minutes=auth_settings.SESSION_ACCESS_TOKEN_EXPIRE_MINUTES)


def get_session_expires_delta() -> timedelta:
    """Get the persisted session TTL used by web clients."""
    return timedelta(days=auth_settings.SESSION_EXPIRE_DAYS)


def issue_access_token_for_user(
    *,
    user: User,
    expires_delta: timedelta | None = None,
    app: str | None = None,
    db_session: AuthSession | None = None,
) -> tuple[str, Any]:
    """Issue an access token and return its expiry timestamp."""
    ttl = expires_delta or get_legacy_access_token_expires_delta()
    expires_at = utc_now() + ttl
    return create_access_token(
        user.id,
        expires_delta=ttl,
        app=app,
        session_id=str(db_session.id) if db_session else None,
    ), expires_at


def is_session_active(db_session: AuthSession, now: Any | None = None) -> bool:
    """Return whether a stored session is active and usable."""
    current_time = now or utc_now()
    return db_session.revoked_at is None and db_session.expires_at > current_time


async def create_session(
    *,
    session: AsyncSession,
    user: User,
    client_type: str = "web",
    app_name: str | None = None,
    user_agent: str | None = None,
    ip_address: str | None = None,
    expires_delta: timedelta | None = None,
    enforce_approval: bool = True,
    mfa_verified_at: datetime | None = None,
    mfa_source_session: AuthSession | None = None,
) -> tuple[AuthSession, str]:
    """Create and persist a new opaque session for a user.

    App-scoped sessions (``enforce_approval=False``) skip the staff approval
    gate; the caller has already checked app eligibility.
    """
    if mfa_verified_at is not None or mfa_source_session is not None:
        verified_secret = user.totp_secret
        # Hold the same account lock as disable until the new session is committed.
        # A completed factor check cannot outlive concurrent disable/re-enrolment.
        await session.flush()
        await session.refresh(user, with_for_update=True)
        if not user.totp_enabled or user.totp_secret != verified_secret:
            mfa_verified_at = None
        if mfa_source_session is not None:
            source = await session.scalar(
                select(AuthSession)
                .where(AuthSession.id == mfa_source_session.id)
                .execution_options(populate_existing=True)
            )
            if (
                source is None
                or source.user_id != user.id
                or not is_session_active(source)
            ):
                raise AppException("Sign in again", 401)
            mfa_verified_at = source.mfa_verified_at
    if enforce_approval:
        require_approved_account(user)
    now = utc_now()
    session_secret = create_session_token()
    user.last_login_at = now
    session.add(user)
    db_session = AuthSession(
        **SessionCreate(
            mfa_verified_at=mfa_verified_at,
            user_id=user.id,
            session_token=hash_session_token(session_secret),
            expires_at=now + (expires_delta or get_session_expires_delta()),
            client_type=client_type,
            app_name=app_name,
            user_agent=user_agent,
            ip_address=ip_address,
            last_used_at=now,
        ).model_dump()
    )
    session.add(db_session)
    await session.commit()
    await session.refresh(db_session)
    return db_session, session_secret


async def get_session_by_secret(
    *, session: AsyncSession, session_secret: str
) -> AuthSession | None:
    """Look up a persisted session by the raw opaque secret."""
    statement = select(AuthSession).where(
        AuthSession.session_token == hash_session_token(session_secret)
    )
    result = await session.execute(statement)
    return result.scalars().first()


async def get_active_session_by_secret(
    *, session: AsyncSession, session_secret: str
) -> AuthSession | None:
    """Return an active session or None when the secret is invalid, expired, or revoked."""
    db_session = await get_session_by_secret(
        session=session, session_secret=session_secret
    )
    if not db_session or not is_session_active(db_session):
        return None
    return db_session


async def touch_session(
    *,
    session: AsyncSession,
    db_session: AuthSession,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> AuthSession:
    """Update activity metadata for a session."""
    now = utc_now()
    db_session.last_used_at = now
    db_session.updated_at = now
    if user_agent is not None:
        db_session.user_agent = user_agent
    if ip_address is not None:
        db_session.ip_address = ip_address
    session.add(db_session)
    await session.commit()
    await session.refresh(db_session)
    return db_session


async def revoke_session(
    *, session: AsyncSession, db_session: AuthSession
) -> AuthSession:
    """Revoke a persisted session."""
    now = utc_now()
    if db_session.revoked_at is None:
        db_session.revoked_at = now
    db_session.updated_at = now
    session.add(db_session)
    await session.commit()
    await session.refresh(db_session)
    return db_session


async def revoke_user_sessions(
    *,
    session: AsyncSession,
    user_id: uuid.UUID,
) -> int:
    """Revoke every active session owned by a user."""
    statement = (
        select(AuthSession)
        .where(
            AuthSession.user_id == user_id,
            AuthSession.revoked_at.is_(None),
        )
        .limit(500)
    )  # a user shouldn't have more active sessions than this
    result = await session.execute(statement)
    sessions = list(result.scalars().all())
    if not sessions:
        return 0

    now = utc_now()
    revoked_count = 0
    for db_session in sessions:
        db_session.revoked_at = now
        db_session.updated_at = now
        session.add(db_session)
        revoked_count += 1

    await session.commit()
    return revoked_count


async def revoke_user_app_sessions(
    *,
    session: AsyncSession,
    user_id: uuid.UUID,
    app_key: str,
) -> int:
    """Revoke a user's active sessions in one app, leaving the rest alone."""
    result = await session.execute(
        select(AuthSession).where(
            AuthSession.user_id == user_id,
            AuthSession.app_name == app_key,
            AuthSession.revoked_at.is_(None),
        )
    )
    now = utc_now()
    revoked = 0
    for db_session in result.scalars().all():
        db_session.revoked_at = now
        db_session.updated_at = now
        session.add(db_session)
        revoked += 1
    if revoked:
        await session.commit()
    return revoked


async def exchange_session_for_access_token(
    *,
    session: AsyncSession,
    session_secret: str,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> tuple[AuthSession, User, str, Any] | None:
    """Validate a session, refresh its activity metadata, and mint a short-lived access token."""
    db_session = await get_active_session_by_secret(
        session=session, session_secret=session_secret
    )
    if not db_session:
        return None

    user = await get_user_by_id(session=session, user_id=db_session.user_id)
    scoped_app = db_session.app_name if is_app_scoped(db_session.app_name) else None
    if scoped_app is not None:
        eligible = user is not None and await is_eligible_for_app(
            session=session, user=user, app_key=scoped_app
        )
    elif is_registered(db_session.app_name):
        # Staff-app session (GAA Admin): keep the staff gate.
        eligible = user is not None and is_staff_eligible(user)
    else:
        # Account session from auth.barrels.gd: any active account. Its
        # unscoped token still fails every staff route for unapproved users.
        eligible = user is not None and user.is_active
    if not eligible or user is None:
        await revoke_session(session=session, db_session=db_session)
        return None

    if is_registered(db_session.app_name) and (
        not is_app_scoped(db_session.app_name) or db_session.app_name == "cms"
    ):
        from src.auth.privileged_mfa import require_privileged_mfa

        await require_privileged_mfa(
            session,
            user,
            login_session=db_session,
            app_key="cms" if db_session.app_name == "cms" else None,
        )
    db_session = await touch_session(
        session=session,
        db_session=db_session,
        user_agent=user_agent,
        ip_address=ip_address,
    )
    access_token, access_token_expires_at = issue_access_token_for_user(
        user=user,
        expires_delta=get_session_access_token_expires_delta(),
        app=scoped_app,
        db_session=db_session,
    )
    return db_session, user, access_token, access_token_expires_at


async def rotate_session(
    *,
    session: AsyncSession,
    db_session: AuthSession,
    user: User,
    user_agent: str | None = None,
    ip_address: str | None = None,
) -> tuple[AuthSession, str]:
    """Rotate an active session by revoking it and minting a replacement."""
    await session.refresh(user, with_for_update=True)
    await session.refresh(db_session)
    if not is_session_active(db_session):
        raise AppException("Sign in again", 401)
    await revoke_session(session=session, db_session=db_session)
    return await create_session(
        session=session,
        user=user,
        client_type=db_session.client_type,
        mfa_verified_at=db_session.mfa_verified_at,
        app_name=db_session.app_name,
        user_agent=user_agent or db_session.user_agent,
        ip_address=ip_address or db_session.ip_address,
        # Only staff-app sessions require staff approval.
        enforce_approval=is_registered(db_session.app_name)
        and not is_app_scoped(db_session.app_name),
    )
