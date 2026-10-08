"""App-scoped sign-in: email codes, password, Google and phone codes.

Every flow ends in ``_session_response``, which creates a session bound to one
app and mints an access token carrying that app's claim (ADR-0016).
"""

import base64
import hashlib
import logging
import secrets
import uuid
from datetime import datetime, timedelta
from urllib.parse import urlencode

import httpx
import jwt
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from src.auth import modern_service, otp, service
from src.auth.account_security import verify_factor
from src.auth.app_schemas import (
    AppEmailCodeStart,
    AppEmailCodeVerify,
    AppHandoffCode,
    AppHandoffRedeem,
    AppHandoffStart,
    AppPasswordLogin,
    AppPhoneCodeStart,
    AppPhoneCodeVerify,
)
from src.auth.apps import AppDefinition, is_registered, require_method
from src.auth.config import auth_settings
from src.auth.devices import remember_device, schedule_new_sign_in_alert
from src.auth.lockout import login_lockout
from src.auth.models import Role, User, UserRoleLink
from src.auth.models import Session as LoginSession
from src.auth.modern_models import AuthChallenge, ExternalIdentity
from src.auth.modern_schemas import (
    GoogleChallengePublic,
    GoogleComplete,
    GoogleFinish,
    GoogleStart,
    GoogleStartPublic,
)
from src.auth.schemas import SessionLoginResponse, SessionPublic, SessionUserPublic
from src.auth.utils import get_password_hash_async
from src.email import send_email
from src.email_config import email_settings
from src.exceptions import AppException
from src.models import Message
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

CODE_TTL_MINUTES = 10
MAX_CODE_ATTEMPTS = 5
GENERIC_SENT = "If that address can sign in here, we've sent a 6-digit code."
GENERIC_PHONE_SENT = (
    "If that number is linked to an account, we've sent a 6-digit code."
)


def new_code() -> str:
    """Six random digits. Patched in tests to read the code back."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _challenge_key(purpose: str, target: str) -> str:
    """One outstanding code per purpose and address/number, user or not."""
    return modern_service.digest(f"{purpose}:{target.lower()}")


def _code_hash(target: str, code: str) -> str:
    return modern_service.digest(f"{target.lower()}:{code}")


async def _issue_code(
    session: AsyncSession,
    *,
    purpose: str,
    target: str,
    user_id: uuid.UUID | None = None,
    extra: dict[str, str] | None = None,
) -> str:
    """Replace any outstanding code for this purpose and target with a new one."""
    key = _challenge_key(purpose, target)
    await session.execute(delete(AuthChallenge).where(AuthChallenge.token_hash == key))
    code = new_code()
    session.add(
        AuthChallenge(
            token_hash=key,
            purpose=purpose,
            user_id=user_id,
            expires_at=utc_now() + timedelta(minutes=CODE_TTL_MINUTES),
            data={"code": _code_hash(target, code), "attempts": 0, **(extra or {})},
        )
    )
    await session.flush()
    return code


async def _verify_code(
    session: AsyncSession, *, purpose: str, target: str, code: str, consume: bool = True
) -> AuthChallenge:
    """Single-use, expiring, and locked after MAX_CODE_ATTEMPTS wrong guesses."""
    challenge = (
        await session.execute(
            select(AuthChallenge)
            .where(
                AuthChallenge.token_hash == _challenge_key(purpose, target),
                AuthChallenge.purpose == purpose,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    invalid = AppException("That code is wrong or has expired. Request a new one.", 400)
    if challenge is None or challenge.expires_at < utc_now():
        raise invalid
    if not secrets.compare_digest(
        str(challenge.data.get("code", "")), _code_hash(target, code)
    ):
        attempts = int(challenge.data.get("attempts", 0)) + 1
        if attempts >= MAX_CODE_ATTEMPTS:
            await session.delete(challenge)
        else:
            challenge.data = {**challenge.data, "attempts": attempts}
            session.add(challenge)
        await session.commit()
        raise invalid
    if consume:
        await session.delete(challenge)
        await session.flush()
    return challenge


async def _unique_username(session: AsyncSession, email: str) -> str:
    base = "".join(ch for ch in email.split("@", 1)[0].lower() if ch.isalnum())[:40]
    base = base or "member"
    for _ in range(5):
        candidate = f"{base}-{secrets.token_hex(3)}"
        taken = await session.scalar(select(User.id).where(User.username == candidate))
        if taken is None:
            return candidate
    return f"member-{uuid.uuid4().hex[:12]}"


async def _create_member(
    session: AsyncSession, *, email: str, first_name: str | None, last_name: str | None
) -> User:
    """A self-service account: no staff approval, no password until set."""
    user = User(
        email=email,
        username=await _unique_username(session, email),
        first_name=(first_name or "").strip() or email.split("@", 1)[0][:100],
        last_name=(last_name or "").strip() or "",
        hashed_password=await get_password_hash_async(secrets.token_urlsafe(32)),
        password_setup_pending=True,
        # Staff approval semantics: residents never pass the staff portal gate.
        registration_pending=True,
        email_verification_required=True,
        is_active=True,
        is_superuser=False,
    )
    session.add(user)
    await session.flush()
    return user


async def ensure_member(session: AsyncSession, user: User, app: AppDefinition) -> None:
    """Grant the app's default role on first sign-in when self sign-up is open."""
    if await service.is_eligible_for_app(session=session, user=user, app_key=app.key):
        return
    if not app.self_signup:
        raise AppException("Ask the team to give you access to this app.", 403)
    role_id = await session.scalar(select(Role.id).where(Role.name == app.default_role))
    if role_id is None:
        raise AppException("App roles are not seeded yet", 503)
    exists = await session.get(UserRoleLink, (user.id, role_id))
    if exists is None:
        session.add(UserRoleLink(user_id=user.id, role_id=role_id))
    await session.commit()


async def _session_response(
    request: Request,
    session: AsyncSession,
    user: User,
    app: AppDefinition,
    *,
    mfa_verified_at: datetime | None = None,
    mfa_source_session: LoginSession | None = None,
) -> SessionLoginResponse:
    # Staff apps (ADR-0017) keep the staff gate and mint ordinary staff tokens.
    staff = app.scope == "staff"
    eligible = (
        service.is_staff_eligible(user)
        if staff
        else await service.is_eligible_for_app(
            session=session, user=user, app_key=app.key
        )
    )
    if not eligible:
        raise AppException("This account can't sign in to this app.", 403)
    user_agent = request.headers.get("user-agent")
    ip_address = request.client.host if request.client else None
    new_device = remember_device(user, user_agent)
    db_session, session_token = await service.create_session(
        session=session,
        user=user,
        client_type="web",
        app_name=app.key,
        user_agent=user_agent,
        ip_address=ip_address,
        enforce_approval=staff,
        mfa_verified_at=mfa_verified_at,
        mfa_source_session=mfa_source_session,
    )
    if staff or app.key == "cms":
        from src.auth.privileged_mfa import require_privileged_mfa

        await require_privileged_mfa(
            session,
            user,
            login_session=db_session,
            app_key="cms" if app.key == "cms" else None,
        )
    if new_device:
        schedule_new_sign_in_alert(
            email_to=user.email,
            device=new_device,
            ip_address=ip_address,
            signed_in_at=db_session.created_at,
        )
    access_token, expires = service.issue_access_token_for_user(
        user=user,
        expires_delta=service.get_session_access_token_expires_delta(),
        app=None if staff else app.key,
        db_session=db_session,
    )
    return SessionLoginResponse(
        access_token=access_token,
        access_token_expires_at=expires,
        session_token=session_token,
        session_expires_at=db_session.expires_at,
        session=SessionPublic.model_validate(db_session, from_attributes=True),
        user=SessionUserPublic.model_validate(user, from_attributes=True),
    )


async def _require_totp(
    session: AsyncSession, user: User, totp_code: str | None
) -> None:
    if not user.totp_enabled:
        return
    if await login_lockout.is_locked(user.email):
        raise AppException(
            "Account temporarily locked due to repeated failed logins", 429
        )
    if not await verify_factor(session, user, totp_code or ""):
        if totp_code:
            await login_lockout.record_failure(user.email)
        await session.commit()
        raise AppException("Two-factor authentication code required or invalid", 400)
    await login_lockout.reset(user.email)


# --- Email one-time code (passwordless sign-in and sign-up) --------------------


async def email_code_start(
    *, session: AsyncSession, app: AppDefinition, body: AppEmailCodeStart
) -> Message:
    """Send a code. New addresses get an account only after verifying it."""
    require_method(app, "email_code")
    email = str(body.email).lower()
    user = await service.get_user_by_email(session=session, email=email)
    if user is None and not app.self_signup:
        return Message(message=GENERIC_SENT)
    if user is not None and not user.is_active:
        return Message(message=GENERIC_SENT)
    code = await _issue_code(
        session,
        purpose=f"code:{app.key}",
        target=email,
        user_id=user.id if user else None,
        extra={
            "first_name": (body.first_name or "").strip()[:100],
            "last_name": (body.last_name or "").strip()[:100],
        },
    )
    await session.commit()
    if email_settings.EMAILS_ENABLED:
        try:
            await run_in_threadpool(
                send_email,
                email_to=email,
                subject=f"Your {app.label} sign-in code: {code}",
                html_content=(
                    f"<p>Your {app.label} code is</p>"
                    f'<p style="font-size:28px;font-weight:700;letter-spacing:4px">{code}</p>'
                    f"<p>It expires in {CODE_TTL_MINUTES} minutes. If you didn't ask for it, ignore this email.</p>"
                ),
            )
        except Exception as exc:
            raise AppException(
                "We couldn't send the code. Try again shortly.", 503
            ) from exc
    elif auth_settings.ENVIRONMENT == "local":
        logger.warning("Email code for %s (%s): %s", email, app.key, code)
    return Message(message=GENERIC_SENT)


async def email_code_verify(
    *,
    request: Request,
    session: AsyncSession,
    app: AppDefinition,
    body: AppEmailCodeVerify,
) -> SessionLoginResponse:
    require_method(app, "email_code")
    email = str(body.email).lower()
    challenge = await _verify_code(
        session, purpose=f"code:{app.key}", target=email, code=body.code, consume=False
    )
    user = await service.get_user_by_email(session=session, email=email)
    if user is None:
        if not app.self_signup:
            raise AppException("Ask the team to give you access to this app.", 403)
        user = await _create_member(
            session,
            email=email,
            first_name=challenge.data.get("first_name") or None,
            last_name=challenge.data.get("last_name") or None,
        )
    if not user.is_active:
        raise AppException("That code is wrong or has expired. Request a new one.", 400)
    await _require_totp(session, user, body.totp_code)
    await session.delete(challenge)
    if user.email_verified_at is None:
        user.email_verified_at = utc_now()
        session.add(user)
    await session.commit()
    await ensure_member(session, user, app)
    return await _session_response(
        request,
        session,
        user,
        app,
        mfa_verified_at=utc_now() if user.totp_enabled else None,
    )


# --- Email and password -------------------------------------------------------


async def password_login(
    *,
    request: Request,
    session: AsyncSession,
    app: AppDefinition,
    body: AppPasswordLogin,
) -> SessionLoginResponse:
    require_method(app, "password")
    email = str(body.email).lower()
    if await login_lockout.is_locked(email):
        raise AppException(
            "Account temporarily locked due to repeated failed logins", 429
        )
    user = await service.authenticate(
        session=session, email=email, password=body.password
    )
    if user is None or user.password_setup_pending:
        await login_lockout.record_failure(email)
        raise AppException("Incorrect email or password", 400)
    await _require_totp(session, user, body.totp_code)
    await login_lockout.reset(email)
    await ensure_member(session, user, app)
    return await _session_response(
        request,
        session,
        user,
        app,
        mfa_verified_at=utc_now() if user.totp_enabled else None,
    )


# --- Google -------------------------------------------------------------------


async def google_start(
    *, session: AsyncSession, app: AppDefinition, body: GoogleStart
) -> GoogleStartPublic:
    require_method(app, "google")
    nonce, verifier = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
    state = await modern_service.issue(
        session,
        f"g:{app.key}",
        data={"binding": body.browser_binding, "nonce": nonce, "verifier": verifier},
        minutes=10,
    )
    await session.commit()
    params = {
        "client_id": auth_settings.GOOGLE_CLIENT_ID,
        "redirect_uri": app.google_redirect_uri,
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


async def google_complete(
    *, session: AsyncSession, app: AppDefinition, body: GoogleComplete
) -> GoogleChallengePublic:
    require_method(app, "google")
    state = await modern_service.consume(session, body.state, f"g:{app.key}")
    if not secrets.compare_digest(state.data["binding"], body.browser_binding):
        raise AppException("Google sign-in browser mismatch", 400)
    await session.commit()
    try:
        claims = await modern_service.google_claims(
            body.code, state.data["verifier"], redirect_uri=app.google_redirect_uri
        )
    except (httpx.HTTPError, jwt.PyJWTError, KeyError, ValueError) as exc:
        raise AppException("Google sign-in failed. Start again.", 400) from exc
    if (
        claims.get("nonce") != state.data["nonce"]
        or claims.get("email_verified") is not True
    ):
        raise AppException("Google identity could not be verified", 400)
    email = str(claims["email"]).lower()
    domain = email.rsplit("@", 1)[-1]
    # Only trust Google for addresses Google actually manages.
    if domain != "gmail.com" and claims.get("hd") != domain:
        raise AppException("Use an email code for this address instead.", 403)
    identity = await session.get(ExternalIdentity, (claims["sub"], "google"))
    user = (
        await session.get(User, identity.user_id)
        if identity
        else await service.get_user_by_email(session=session, email=email)
    )
    if user is None:
        if not app.self_signup:
            raise AppException("Ask the team to give you access to this app.", 403)
        user = await _create_member(
            session,
            email=email,
            first_name=claims.get("given_name"),
            last_name=claims.get("family_name"),
        )
    if not user.is_active or user.email.lower() != email:
        raise AppException("This Google account can't sign in here.", 403)
    token = await modern_service.issue(
        session,
        f"gl:{app.key}",
        user_id=user.id,
        data={"subject": claims["sub"], "email": user.email},
    )
    await session.commit()
    return GoogleChallengePublic(challenge=token, requires_totp=user.totp_enabled)


async def google_finish(
    *, request: Request, session: AsyncSession, app: AppDefinition, body: GoogleFinish
) -> SessionLoginResponse:
    require_method(app, "google")
    challenge = await modern_service.consume(session, body.challenge, f"gl:{app.key}")
    user = await session.get(User, challenge.user_id)
    if user is None or not user.is_active or user.email != challenge.data["email"]:
        raise AppException("Account unavailable", 403)
    await _require_totp(session, user, body.totp_code)
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
    user.email_verified_at = user.email_verified_at or utc_now()
    session.add(user)
    await session.commit()
    await ensure_member(session, user, app)
    return await _session_response(
        request,
        session,
        user,
        app,
        mfa_verified_at=utc_now() if user.totp_enabled else None,
    )


# --- Phone and WhatsApp (linked accounts only; off until a provider is chosen) --


async def phone_code_start(
    *, session: AsyncSession, app: AppDefinition, body: AppPhoneCodeStart
) -> Message:
    require_method(app, "phone")
    user = await session.scalar(
        select(User).where(
            User.phone_e164 == body.phone, User.phone_verified_at.is_not(None)
        )
    )
    if user is None or not user.is_active:
        return Message(message=GENERIC_PHONE_SENT)
    code = await _issue_code(
        session, purpose=f"phone:{app.key}", target=body.phone, user_id=user.id
    )
    await session.commit()
    otp.send_code(phone=body.phone, channel=body.channel, code=code)
    return Message(message=GENERIC_PHONE_SENT)


async def phone_code_verify(
    *,
    request: Request,
    session: AsyncSession,
    app: AppDefinition,
    body: AppPhoneCodeVerify,
) -> SessionLoginResponse:
    require_method(app, "phone")
    user = await session.scalar(select(User).where(User.phone_e164 == body.phone))
    if user is None or not user.is_active:
        raise AppException("That code is wrong or has expired. Request a new one.", 400)
    challenge = await _verify_code(
        session,
        purpose=f"phone:{app.key}",
        target=body.phone,
        code=body.code,
        consume=False,
    )
    await _require_totp(session, user, body.totp_code)
    await session.delete(challenge)
    await session.commit()
    await ensure_member(session, user, app)
    return await _session_response(
        request,
        session,
        user,
        app,
        mfa_verified_at=utc_now() if user.totp_enabled else None,
    )


async def phone_link_start(
    *, session: AsyncSession, app: AppDefinition, user: User, body: AppPhoneCodeStart
) -> Message:
    require_method(app, "phone")
    owner = await session.scalar(select(User.id).where(User.phone_e164 == body.phone))
    if owner is not None and owner != user.id:
        # Don't reveal which numbers are registered.
        return Message(message="We've sent a 6-digit code to that number.")
    # Keyed by user as well, so two members can't race for the same number.
    code = await _issue_code(
        session,
        purpose=f"plink:{app.key}",
        target=f"{user.id}:{body.phone}",
        user_id=user.id,
    )
    await session.commit()
    otp.send_code(phone=body.phone, channel=body.channel, code=code)
    return Message(message="We've sent a 6-digit code to that number.")


async def phone_link_verify(
    *, session: AsyncSession, app: AppDefinition, user: User, body: AppPhoneCodeVerify
) -> Message:
    require_method(app, "phone")
    await _verify_code(
        session,
        purpose=f"plink:{app.key}",
        target=f"{user.id}:{body.phone}",
        code=body.code,
    )
    owner = await session.scalar(select(User.id).where(User.phone_e164 == body.phone))
    if owner is not None and owner != user.id:
        raise AppException("That number is linked to another account.", 409)
    user.phone_e164 = body.phone
    user.phone_verified_at = utc_now()
    session.add(user)
    await session.commit()
    return Message(message="Phone number linked. You can now sign in with a code.")


# --- Single sign-on handoff from auth.barrels.gd (ADR-0017) -------------------

HANDOFF_PURPOSE = "app_handoff"
HANDOFF_TTL_MINUTES = 1
HANDOFF_EXPIRED = "That sign-in link expired or was already used. Try again."


def _require_sso(app: AppDefinition) -> None:
    if not app.sso:
        raise AppException("This app doesn't accept single sign-on", 404)


async def handoff_start(
    *, session: AsyncSession, app: AppDefinition, body: AppHandoffStart
) -> AppHandoffCode:
    """Turn a live account session into a one-use code for one app.

    Only the account session (from auth.barrels.gd, not a registered app's
    session) may start a handoff, so no app session can mint access to another.
    """
    _require_sso(app)
    account = await service.get_active_session_by_secret(
        session=session, session_secret=body.session_token
    )
    if account is None or is_registered(account.app_name):
        raise AppException("Sign in again", 401)
    user = await service.get_user_by_id(session=session, user_id=account.user_id)
    if user is None or not user.is_active:
        raise AppException("Sign in again", 401)
    if app.scope == "staff":
        if not service.is_staff_eligible(user):
            raise AppException(
                "Ask an administrator to approve your account for staff tools.",
                403,
            )
    elif user.email_verified_at is None and not (
        app.key == "cms" and service.cms_identity_ready(user)
    ):
        raise AppException(
            "Verify your email address before signing in to this app.", 403
        )
    elif not await service.is_eligible_for_app(
        session=session, user=user, app_key=app.key
    ):
        if not app.self_signup:
            raise AppException("Ask the team to give you access to this app.", 403)
        if app.join_prompt and not body.join:
            raise AppException(f"Join {app.label} to continue.", 409)
        await ensure_member(session, user, app)
        if not await service.is_eligible_for_app(
            session=session, user=user, app_key=app.key
        ):
            raise AppException("This account can't sign in to this app.", 403)
    if app.scope == "staff" or app.key == "cms":
        from src.auth.privileged_mfa import require_privileged_mfa

        await require_privileged_mfa(session, user, login_session=account)
    code = await modern_service.issue(
        session,
        HANDOFF_PURPOSE,
        user_id=user.id,
        data={
            "app": app.key,
            "state": modern_service.digest(body.state),
            "source_session_id": str(account.id),
        },
        minutes=HANDOFF_TTL_MINUTES,
    )
    await session.commit()
    return AppHandoffCode(code=code, callback_url=app.callback_url)


async def handoff_redeem(
    *,
    request: Request,
    session: AsyncSession,
    app: AppDefinition,
    body: AppHandoffRedeem,
) -> SessionLoginResponse:
    """Exchange a handoff code for a new session in this app only."""
    _require_sso(app)
    if not secrets.compare_digest(
        body.client_secret.encode(), app.client_secret.encode()
    ):
        raise AppException("Unknown app credentials", 401)
    try:
        challenge = await modern_service.consume(session, body.code, HANDOFF_PURPOSE)
    except AppException:
        raise AppException(HANDOFF_EXPIRED, 400) from None
    data, user_id = challenge.data, challenge.user_id
    # The code is spent even when it doesn't match, so it can't be retried.
    await session.commit()
    matches = data.get("app") == app.key and secrets.compare_digest(
        str(data.get("state", "")), modern_service.digest(body.state)
    )
    if not matches or user_id is None:
        raise AppException(HANDOFF_EXPIRED, 400)
    user = await service.get_user_by_id(session=session, user_id=user_id)
    if user is None or not user.is_active:
        raise AppException(HANDOFF_EXPIRED, 400)
    try:
        source_id = uuid.UUID(str(data.get("source_session_id", "")))
    except ValueError:
        raise AppException(HANDOFF_EXPIRED, 400) from None
    source = await session.get(LoginSession, source_id)
    if (
        source is None
        or source.user_id != user.id
        or is_registered(source.app_name)
        or not service.is_session_active(source)
    ):
        raise AppException(HANDOFF_EXPIRED, 400)
    return await _session_response(
        request,
        session,
        user,
        app,
        mfa_verified_at=source.mfa_verified_at,
        mfa_source_session=source,
    )


# --- Barrels account: email-code sign-in at auth.barrels.gd (ADR-0017) --------


def _account() -> AppDefinition:
    """The account itself, for the shared code helpers (not a registered app)."""
    return AppDefinition(
        key="account",
        label="Barrels account",
        url=auth_settings.AUTH_FRONTEND_URL.rstrip("/"),
        self_signup=auth_settings.ALLOW_PUBLIC_SIGNUP,
        default_role="",
        google_redirect_uri="",
        methods=frozenset({"email_code"}),
    )


async def account_email_code_start(
    *, session: AsyncSession, body: AppEmailCodeStart
) -> Message:
    return await email_code_start(session=session, app=_account(), body=body)


async def account_email_code_verify(
    *, request: Request, session: AsyncSession, body: AppEmailCodeVerify
) -> SessionLoginResponse:
    """Verify the code and open an account session; first use creates the account."""
    account = _account()
    email = str(body.email).lower()
    challenge = await _verify_code(
        session,
        purpose=f"code:{account.key}",
        target=email,
        code=body.code,
        consume=False,
    )
    user = await service.get_user_by_email(session=session, email=email)
    if user is None:
        if not account.self_signup:
            raise AppException("Registration is currently closed", 403)
        user = await _create_member(
            session,
            email=email,
            first_name=challenge.data.get("first_name") or None,
            last_name=challenge.data.get("last_name") or None,
        )
    if not user.is_active:
        raise AppException("That code is wrong or has expired. Request a new one.", 400)
    await _require_totp(session, user, body.totp_code)
    await session.delete(challenge)
    if user.email_verified_at is None:
        user.email_verified_at = utc_now()
        session.add(user)
    await session.commit()

    user_agent = request.headers.get("user-agent")
    ip_address = request.client.host if request.client else None
    new_device = remember_device(user, user_agent)
    db_session, session_token = await service.create_session(
        session=session,
        user=user,
        client_type="web",
        app_name="auth",
        user_agent=user_agent,
        ip_address=ip_address,
        enforce_approval=False,
        mfa_verified_at=utc_now() if user.totp_enabled else None,
    )
    if new_device:
        schedule_new_sign_in_alert(
            email_to=user.email,
            device=new_device,
            ip_address=ip_address,
            signed_in_at=db_session.created_at,
        )
    access_token, expires = service.issue_access_token_for_user(
        user=user,
        expires_delta=service.get_session_access_token_expires_delta(),
        db_session=db_session,
    )
    return SessionLoginResponse(
        access_token=access_token,
        access_token_expires_at=expires,
        session_token=session_token,
        session_expires_at=db_session.expires_at,
        session=SessionPublic.model_validate(db_session, from_attributes=True),
        user=SessionUserPublic.model_validate(user, from_attributes=True),
    )
