"""Staged privileged MFA policy, shared by bearer and cookie authentication."""

import uuid

import jwt
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import apps, service, totp
from src.auth.config import auth_settings
from src.auth.models import Session as LoginSession
from src.auth.models import User
from src.auth.utils import ALGORITHM


async def require_privileged_mfa(
    session: AsyncSession,
    user: User,
    *,
    token: str | None = None,
    login_session: LoginSession | None = None,
    app_key: str | None = None,
) -> None:
    if auth_settings.AUTH_PRIVILEGED_MFA_MODE != "enforce":
        return
    if not user.is_superuser and not await service.has_effective_permission(
        session=session, user=user, permission_key="user.manage"
    ):
        return
    if login_session is None and token is not None:
        try:
            payload = jwt.decode(
                token, auth_settings.SECRET_KEY, algorithms=[ALGORITHM]
            )
        except jwt.InvalidTokenError:
            raise HTTPException(401, "Sign in again") from None
        try:
            session_id = uuid.UUID(str(payload.get("sid", "")))
        except ValueError:
            session_id = None
        if session_id is not None:
            login_session = await session.get(LoginSession, session_id)
    if not user.totp_enabled or not totp.is_encrypted(user.totp_secret):
        raise HTTPException(
            403,
            "Set up two-step verification and save recovery codes in account security before using privileged staff tools",
        )
    if (
        login_session is None
        or login_session.user_id != user.id
        or (
            login_session.app_name != app_key
            if app_key
            else apps.is_app_scoped(login_session.app_name)
        )
        or not service.is_session_active(login_session)
        or login_session.mfa_verified_at is None
    ):
        raise HTTPException(
            403,
            "Sign in again with your authenticator or recovery code before using privileged staff tools",
        )
