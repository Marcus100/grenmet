"""Verified email and Google OIDC, sharing the existing persisted sessions."""

import base64
import hashlib
import secrets
import uuid
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, delete, select
from starlette.requests import Request

from src.auth import service, totp
from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.modern_models import AuthChallenge, ExternalIdentity
from src.auth.modern_schemas import (
    AccountSecurityPublic,
    EmailConfirm,
    EmailRequest,
    GoogleChallengePublic,
    GoogleComplete,
    GoogleFinish,
    GoogleStart,
    GoogleStartPublic,
    SecuritySessionPublic,
)
from src.auth.schemas import SessionLoginResponse, SessionPublic, UserPublic
from src.auth.utils import get_password_hash_async
from src.dependencies import SessionDep
from src.email import send_email
from src.exceptions import AppException
from src.models import Message
from src.utils.datetime import utc_now


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


async def issue(
    session: AsyncSession,
    purpose: str,
    *,
    user_id: uuid.UUID | None = None,
    data: dict[str, Any] | None = None,
    minutes: int = 15,
) -> str:
    raw = secrets.token_urlsafe(48)
    session.add(
        AuthChallenge(
            token_hash=digest(raw),
            purpose=purpose,
            user_id=user_id,
            expires_at=utc_now() + timedelta(minutes=minutes),
            data=data or {},
        )
    )
    await session.flush()
    return raw


async def consume(session: AsyncSession, token: str, purpose: str) -> AuthChallenge:
    result = await session.execute(
        select(AuthChallenge)
        .where(
            AuthChallenge.token_hash == digest(token),
            col(AuthChallenge.purpose) == purpose,
        )
        .with_for_update()
    )
    challenge = result.scalars().first()
    if challenge is None or challenge.expires_at < utc_now():
        raise AppException("Link expired or already used. Request a new link.", 400)
    await session.delete(challenge)
    await session.flush()
    return challenge


async def email_request(
    request: Request, session: SessionDep, body: EmailRequest
) -> Message:
    _ = request
    user = await service.get_user_by_email(session=session, email=body.email)
    if user and user.is_active:
        await session.execute(
            delete(AuthChallenge).where(
                col(AuthChallenge.user_id) == user.id,
                col(AuthChallenge.purpose) == "email",
            )
        )
        token = await issue(
            session, "email", user_id=user.id, data={"email": user.email}
        )
        url = f"{auth_settings.AUTH_FRONTEND_URL.rstrip('/')}/verify-email?{urlencode({'token': token})}"
        await run_in_threadpool(
            send_email,
            email_to=user.email,
            subject="Verify your email and set your password",
            html_content=f'<p>Finish setting up your account. This link expires in 15 minutes.</p><p><a href="{url}">Verify email and set password</a></p>',
        )
        await session.commit()
    return Message(
        message="If your account is ready, a verification link has been sent."
    )


async def email_confirm(
    request: Request, session: SessionDep, body: EmailConfirm
) -> Message:
    _ = request
    challenge = await consume(session, body.token, "email")
    user = await session.get(User, challenge.user_id)
    if not user or not user.is_active or user.email != challenge.data.get("email"):
        raise AppException("Account is not available for verification", 400)
    user.hashed_password = await get_password_hash_async(body.new_password)
    user.email_verified_at = utc_now()
    user.password_setup_pending = False
    session.add(user)
    from src.auth.models import Session as LoginSession

    await session.execute(
        delete(LoginSession).where(col(LoginSession.user_id) == user.id)
    )
    await session.commit()
    return Message(message="Email verified. You can now sign in.")


def google_ready() -> None:
    if not (
        auth_settings.GOOGLE_CLIENT_ID
        and auth_settings.GOOGLE_CLIENT_SECRET
        and auth_settings.GOOGLE_REDIRECT_URI
    ):
        raise AppException("Google sign-in is not configured yet", 503)


async def google_start(
    request: Request, session: SessionDep, body: GoogleStart
) -> GoogleStartPublic:
    _ = request
    google_ready()
    nonce, verifier = (secrets.token_urlsafe(32), secrets.token_urlsafe(48))
    state = await issue(
        session,
        "google",
        data={"binding": body.browser_binding, "nonce": nonce, "verifier": verifier},
        minutes=10,
    )
    await session.commit()
    params = {
        "client_id": auth_settings.GOOGLE_CLIENT_ID,
        "redirect_uri": auth_settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "nonce": nonce,
        "code_challenge": base64.urlsafe_b64encode(
            hashlib.sha256(verifier.encode()).digest()
        )
        .decode()
        .rstrip("="),
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    return GoogleStartPublic(
        authorization_url="https://accounts.google.com/o/oauth2/v2/auth?"
        + urlencode(params)
    )


async def google_claims(code: str, verifier: str) -> dict[str, Any]:
    async with httpx.AsyncClient(timeout=15) as client:
        response = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": auth_settings.GOOGLE_CLIENT_ID,
                "client_secret": auth_settings.GOOGLE_CLIENT_SECRET,
                "redirect_uri": auth_settings.GOOGLE_REDIRECT_URI,
                "grant_type": "authorization_code",
                "code_verifier": verifier,
            },
        )
        response.raise_for_status()
        token = response.json()["id_token"]
        keys = await client.get("https://www.googleapis.com/oauth2/v3/certs")
        keys.raise_for_status()
    header = jwt.get_unverified_header(token)
    key = next((k for k in keys.json()["keys"] if k["kid"] == header.get("kid")), None)
    if key is None:
        raise AppException("Google identity could not be verified", 400)
    claims = jwt.decode(
        token,
        jwt.PyJWK.from_dict(key).key,
        algorithms=["RS256"],
        audience=auth_settings.GOOGLE_CLIENT_ID,
        options={"require": ["exp", "iat", "iss", "sub", "nonce", "email"]},
    )
    if claims["iss"] not in {"https://accounts.google.com", "accounts.google.com"}:
        raise AppException("Invalid Google issuer", 400)
    return claims


async def google_complete(
    request: Request, session: SessionDep, body: GoogleComplete
) -> GoogleChallengePublic:
    _ = request
    google_ready()
    state = await consume(session, body.state, "google")
    if not secrets.compare_digest(state.data["binding"], body.browser_binding):
        raise AppException("Google sign-in browser mismatch", 400)
    await session.commit()
    try:
        claims = await google_claims(body.code, state.data["verifier"])
    except (httpx.HTTPError, jwt.PyJWTError, KeyError, ValueError) as exc:
        raise AppException("Google sign-in failed. Start again.", 400) from exc
    if (
        claims.get("nonce") != state.data["nonce"]
        or claims.get("email_verified") is not True
    ):
        raise AppException("Google identity could not be verified", 400)
    identity = await session.get(ExternalIdentity, (claims["sub"], "google"))
    user = (
        await session.get(User, identity.user_id)
        if identity
        else await service.get_user_by_email(session=session, email=claims["email"])
    )
    if not user or not user.is_active:
        raise AppException(
            "Ask your administrator to activate your staff account first.", 403
        )
    domain = claims["email"].rsplit("@", 1)[-1].lower()
    if claims["email"].lower() != user.email.lower():
        raise AppException(
            "Google email does not match this account. Verify the current email first.",
            403,
        )
    if domain != "gmail.com" and claims.get("hd") != domain:
        raise AppException(
            "Use verified email/password; Google must manage this email domain.", 403
        )
    token = await issue(
        session,
        "google-login",
        user_id=user.id,
        data={"subject": claims["sub"], "email": user.email},
    )
    await session.commit()
    return GoogleChallengePublic(challenge=token, requires_totp=user.totp_enabled)


async def google_finish(
    request: Request, session: SessionDep, body: GoogleFinish
) -> SessionLoginResponse:
    challenge = await consume(session, body.challenge, "google-login")
    user = await session.get(User, challenge.user_id)
    if not user or not user.is_active or user.email != challenge.data["email"]:
        raise AppException("Account unavailable", 403)
    if user.totp_enabled and (
        not totp.verify_code(secret=user.totp_secret or "", code=body.totp_code or "")
    ):
        await session.commit()
        raise AppException(
            "Invalid authenticator code. Start Google sign-in again.", 400
        )
    identity = await session.get(
        ExternalIdentity, (challenge.data["subject"], "google")
    )
    if identity is not None and identity.user_id != user.id:
        raise AppException("Google account is already linked", 409)
    if identity is None:
        session.add(
            ExternalIdentity(
                subject=challenge.data["subject"], provider="google", user_id=user.id
            )
        )
    user.email_verified_at = utc_now()
    session.add(user)
    await session.commit()
    db_session, session_token = await service.create_session(
        session=session,
        user=user,
        client_type="web",
        app_name="auth",
        user_agent=request.headers.get("user-agent"),
        ip_address=request.client.host if request.client else None,
    )
    access_token, expires = service.issue_access_token_for_user(
        user=user, expires_delta=service.get_session_access_token_expires_delta()
    )
    return SessionLoginResponse(
        access_token=access_token,
        access_token_expires_at=expires,
        session_token=session_token,
        session_expires_at=db_session.expires_at,
        session=SessionPublic.model_validate(db_session, from_attributes=True),
        user=UserPublic.model_validate(user, from_attributes=True),
    )


async def account_security(
    *, session: AsyncSession, user: User
) -> AccountSecurityPublic:
    from sqlmodel import col

    from src.auth.models import Session as LoginSession

    identities = (
        (
            await session.execute(
                select(ExternalIdentity).where(
                    ExternalIdentity.user_id == user.id,
                    ExternalIdentity.provider == "google",
                )
            )
        )
        .scalars()
        .all()
    )
    sessions = (
        (
            await session.execute(
                select(LoginSession)
                .where(
                    LoginSession.user_id == user.id,
                    col(LoginSession.revoked_at).is_(None),
                    LoginSession.expires_at > utc_now(),
                )
                .order_by(col(LoginSession.last_used_at).desc())
            )
        )
        .scalars()
        .all()
    )
    return AccountSecurityPublic(
        email_verified=user.email_verified_at is not None,
        google_configured=bool(
            auth_settings.GOOGLE_CLIENT_ID
            and auth_settings.GOOGLE_CLIENT_SECRET
            and auth_settings.GOOGLE_REDIRECT_URI
        ),
        google_linked=bool(identities),
        totp_enabled=user.totp_enabled,
        sessions=[
            SecuritySessionPublic(
                id=str(row.id),
                app_name=row.app_name,
                client_type=row.client_type,
                last_used_at=row.last_used_at.isoformat(),
                expires_at=row.expires_at.isoformat(),
            )
            for row in sessions
        ],
    )
