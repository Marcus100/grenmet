import pytest

from src.auth import modern_service as modern
from src.auth.modern_models import AuthChallenge
from src.exceptions import AppException


@pytest.mark.asyncio
async def test_challenge_is_hashed_purpose_bound_expiring_and_single_use(db_async):
    token = await modern.issue(db_async, "email")
    await db_async.commit()
    row = await db_async.get(AuthChallenge, modern.digest(token))
    assert row.token_hash != token
    with pytest.raises(AppException):
        await modern.consume(db_async, token, "google")
    await modern.consume(db_async, token, "email")
    await db_async.commit()
    with pytest.raises(AppException):
        await modern.consume(db_async, token, "email")
    expired = await modern.issue(db_async, "email", minutes=-1)
    await db_async.commit()
    with pytest.raises(AppException):
        await modern.consume(db_async, expired, "email")


@pytest.mark.asyncio
async def test_google_start_never_exposes_verifier(async_client, db_async, monkeypatch):
    _ = db_async
    monkeypatch.setattr(
        modern.auth_settings, "GOOGLE_CLIENT_ID", "test.apps.googleusercontent.com"
    )
    monkeypatch.setattr(
        modern.auth_settings, "GOOGLE_CLIENT_SECRET", "private-client-secret"
    )
    monkeypatch.setattr(
        modern.auth_settings,
        "GOOGLE_REDIRECT_URI",
        "https://auth.example.test/google/callback",
    )
    result = await async_client.post(
        "/api/v1/auth/modern/google/start", json={"browser_binding": "a" * 64}
    )
    assert result.status_code == 200
    url = result.json()["authorization_url"]
    assert "code_challenge_method=S256" in url
    assert "private-client-secret" not in url and "code_verifier=" not in url


@pytest.mark.asyncio
async def test_email_confirmation_verifies_address_once_and_revokes_sessions(
    async_client, db_async
):
    from sqlmodel import select

    from src.auth import service
    from src.auth.models import Session as LoginSession
    from src.auth.models import User
    from src.auth.utils import get_password_hash

    user = User(
        email="invite@example.test",
        username="invite",
        first_name="Test",
        last_name="Invite",
        hashed_password=get_password_hash("Initial-password-123!"),
        email_verification_required=True,
        password_setup_pending=True,
    )
    db_async.add(user)
    await db_async.commit()
    _, old_session = await service.create_session(
        session=db_async, user=user, client_type="web", app_name="auth"
    )
    token = await modern.issue(
        db_async, "email", user_id=user.id, data={"email": user.email}
    )
    await db_async.commit()
    body = {"token": token, "new_password": "Verified-password-123!"}
    response = await async_client.post("/api/v1/auth/modern/email/confirm", json=body)
    assert response.status_code == 200
    await db_async.refresh(user)
    assert user.email_verified_at and not user.password_setup_pending
    assert (
        not (
            await db_async.execute(
                select(LoginSession).where(LoginSession.user_id == user.id)
            )
        )
        .scalars()
        .all()
    )
    assert (
        await async_client.post("/api/v1/auth/modern/email/confirm", json=body)
    ).status_code == 400
    assert old_session


@pytest.mark.asyncio
@pytest.mark.parametrize("changed,inactive", [(True, False), (False, True)])
async def test_email_proof_rejects_changed_or_disabled_account(
    async_client, db_async, changed, inactive
):
    from src.auth.models import User
    from src.auth.utils import get_password_hash

    user = User(
        email="before@example.test",
        username="before",
        first_name="Test",
        last_name="User",
        hashed_password=get_password_hash("Initial-password-123!"),
    )
    db_async.add(user)
    await db_async.commit()
    token = await modern.issue(
        db_async, "email", user_id=user.id, data={"email": user.email}
    )
    if changed:
        user.email = "after@example.test"
    if inactive:
        user.is_active = False
    db_async.add(user)
    await db_async.commit()
    response = await async_client.post(
        "/api/v1/auth/modern/email/confirm",
        json={"token": token, "new_password": "Verified-password-123!"},
    )
    assert response.status_code == 400
    await db_async.refresh(user)
    assert user.email_verified_at is None


@pytest.mark.asyncio
async def test_linked_google_identity_cannot_verify_changed_email(
    async_client, db_async, monkeypatch
):
    from src.auth.models import User
    from src.auth.modern_models import ExternalIdentity
    from src.auth.utils import get_password_hash

    user = User(
        email="new@weather.gd",
        username="changed",
        first_name="Test",
        last_name="User",
        hashed_password=get_password_hash("Initial-password-123!"),
    )
    db_async.add(user)
    await db_async.commit()
    db_async.add(
        ExternalIdentity(provider="google", subject="google-subject", user_id=user.id)
    )
    state = await modern.issue(
        db_async,
        "google",
        data={"binding": "a" * 64, "nonce": "nonce", "verifier": "verifier"},
    )
    await db_async.commit()
    monkeypatch.setattr(modern, "google_ready", lambda: None)

    async def claims(*_args):
        return {
            "sub": "google-subject",
            "email": "old@weather.gd",
            "hd": "weather.gd",
            "email_verified": True,
            "nonce": "nonce",
        }

    monkeypatch.setattr(modern, "google_claims", claims)
    response = await async_client.post(
        "/api/v1/auth/modern/google/complete",
        json={"state": state, "code": "code", "browser_binding": "a" * 64},
    )
    assert response.status_code == 403
    await db_async.refresh(user)
    assert user.email_verified_at is None


@pytest.mark.asyncio
async def test_google_mfa_failure_consumes_login_challenge(async_client, db_async):
    from src.auth.models import User
    from src.auth.utils import get_password_hash

    user = User(
        email="mfa@weather.gd",
        username="mfa",
        first_name="Test",
        last_name="MFA",
        hashed_password=get_password_hash("Initial-password-123!"),
        totp_enabled=True,
        totp_secret="JBSWY3DPEHPK3PXP",
    )
    db_async.add(user)
    await db_async.commit()
    token = await modern.issue(
        db_async,
        "google-login",
        user_id=user.id,
        data={"subject": "mfa-subject", "email": user.email},
    )
    await db_async.commit()
    response = await async_client.post(
        "/api/v1/auth/modern/google/finish", json={"challenge": token, "totp_code": ""}
    )
    assert response.status_code == 400
    assert await db_async.get(AuthChallenge, modern.digest(token)) is None


@pytest.mark.asyncio
async def test_security_status_never_exposes_session_secrets_and_mfa_cannot_be_reset(
    db_async,
):
    from src.auth import service
    from src.auth.models import User

    user = User(
        email="security@example.com",
        username="security",
        first_name="Security",
        last_name="Test",
        hashed_password="unused",
        totp_enabled=True,
        totp_secret="PRIVATE",
        roles=[],
    )
    db_async.add(user)
    await db_async.commit()
    _, token = await service.create_session(
        session=db_async, user=user, client_type="web", app_name="auth"
    )
    result = await modern.account_security(session=db_async, user=user)
    assert result.totp_enabled and len(result.sessions) == 1
    assert (
        token not in result.model_dump_json()
        and "PRIVATE" not in result.model_dump_json()
    )
    with pytest.raises(AppException):
        await service.begin_totp_setup(session=db_async, user=user)
    assert user.totp_enabled and user.totp_secret == "PRIVATE"
