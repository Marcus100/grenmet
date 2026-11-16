"""Issue #1535: changing the account email needs proof of the current sign-in.

A stolen or unattended session must not be able to move the account to another
address and then take it over through password recovery. The proof is the current
password, or for an account with no password a code emailed to the current address.
The old address is told after the change through the notifications outbox.
"""

from datetime import timedelta

from sqlalchemy import func, select

from src.auth import app_service, service, totp_enrolment
from src.auth import email_change as email_change_module
from src.auth.models import Session as AuthSession
from src.auth.modern_models import AuthChallenge
from src.notifications.models import OutboundEmail
from src.outbox import Outbox
from src.rate_limit import limiter
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.utils.utils import random_email

ME = "/api/v1/auth/users/me"
START_CODE = "/api/v1/auth/users/me/email-change/code"
PROOF_DETAIL = "email_change_proof_required"


async def _headers(db, user) -> dict[str, str]:
    """A signed-in session for ``user`` without going through the password form."""
    db_session, _ = await service.create_session(
        session=db,
        user=user,
        client_type="web",
        app_name="auth",
        enforce_approval=False,
    )
    token, _ = service.issue_access_token_for_user(
        user=user,
        expires_delta=service.get_session_access_token_expires_delta(),
        db_session=db_session,
    )
    return {"Authorization": f"Bearer {token}"}


def _capture_code_emails(monkeypatch) -> list[tuple[str, str]]:
    sent: list[tuple[str, str]] = []

    def capture(*, email: str, code: str, **_options: str) -> None:
        sent.append((email, code))

    monkeypatch.setattr(app_service, "_schedule_code_email", capture)
    return sent


async def _notices_to(db, address: str) -> list[OutboundEmail]:
    return list(
        (
            await db.scalars(
                select(OutboundEmail).where(OutboundEmail.to_email == address)
            )
        ).all()
    )


async def test_email_change_without_password_is_refused(async_client, db_async):
    user = await make_user(db_async)
    old_email = user.email
    headers = await _headers(db_async, user)

    response = await async_client.patch(
        ME, json={"email": random_email()}, headers=headers
    )

    assert response.status_code == 400
    assert response.json()["detail"].startswith(PROOF_DETAIL)
    await db_async.refresh(user)
    assert user.email == old_email


async def test_email_change_with_wrong_password_is_refused(async_client, db_async):
    user = await make_user(db_async)
    old_email = user.email
    headers = await _headers(db_async, user)

    response = await async_client.patch(
        ME,
        json={"email": random_email(), "current_password": "not-the-password"},
        headers=headers,
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Your current password is not correct."
    await db_async.refresh(user)
    assert user.email == old_email


async def test_email_change_with_correct_password_is_accepted(async_client, db_async):
    user = await make_user(db_async)
    headers = await _headers(db_async, user)
    new_email = random_email()

    response = await async_client.patch(
        ME,
        json={"email": new_email, "current_password": "password123"},
        headers=headers,
    )

    assert response.status_code == 200
    assert response.json()["email"] == new_email
    await db_async.refresh(user)
    assert user.email == new_email
    assert user.email_verified_at is None


async def test_name_only_update_needs_no_proof(async_client, db_async):
    user = await make_user(db_async)
    headers = await _headers(db_async, user)

    response = await async_client.patch(
        ME, json={"first_name": "Ada", "last_name": "Lovelace"}, headers=headers
    )

    assert response.status_code == 200
    assert response.json()["first_name"] == "Ada"


async def test_same_email_with_no_password_needs_no_proof(async_client, db_async):
    user = await make_user(db_async)
    headers = await _headers(db_async, user)

    response = await async_client.patch(
        ME, json={"email": user.email, "first_name": "Ada"}, headers=headers
    )

    assert response.status_code == 200


async def test_old_address_is_told_through_the_outbox(async_client, db_async):
    user = await make_user(db_async)
    old_email = user.email
    headers = await _headers(db_async, user)

    response = await async_client.patch(
        ME,
        json={"email": random_email(), "current_password": "password123"},
        headers=headers,
    )

    assert response.status_code == 200
    notices = await _notices_to(db_async, old_email)
    assert len(notices) == 1
    notice = notices[0]
    assert notice.template == "notification"
    assert notice.transactional is True
    assert notice.subject == "Your email address was changed"
    queued = await db_async.scalar(
        select(Outbox).where(
            Outbox.topic == "email.deliver", Outbox.dedupe_key == str(notice.id)
        )
    )
    assert queued is not None


async def test_name_change_tells_nobody(async_client, db_async):
    user = await make_user(db_async)
    old_email = user.email
    headers = await _headers(db_async, user)

    await async_client.patch(ME, json={"first_name": "Ada"}, headers=headers)

    assert await _notices_to(db_async, old_email) == []


async def test_code_only_account_changes_email_with_a_code_to_the_current_address(
    async_client, db_async, monkeypatch
):
    user = await make_user(db_async)
    user.password_setup_pending = True
    await db_async.commit()
    old_email = user.email
    headers = await _headers(db_async, user)
    sent = _capture_code_emails(monkeypatch)
    new_email = random_email()

    no_code = await async_client.patch(ME, json={"email": new_email}, headers=headers)
    assert no_code.status_code == 400
    assert no_code.json()["detail"].startswith(PROOF_DETAIL)

    started = await async_client.post(START_CODE, headers=headers)
    assert started.status_code == 200
    assert len(sent) == 1
    mailed_to, code = sent[0]
    assert mailed_to == old_email

    wrong = await async_client.patch(
        ME, json={"email": new_email, "email_code": "000000"}, headers=headers
    )
    assert wrong.status_code == 400
    await db_async.refresh(user)
    assert user.email == old_email

    right = await async_client.patch(
        ME, json={"email": new_email, "email_code": code}, headers=headers
    )
    assert right.status_code == 200
    await db_async.refresh(user)
    assert user.email == new_email
    assert len(await _notices_to(db_async, old_email)) == 1


async def test_emailed_code_is_single_use(async_client, db_async, monkeypatch):
    user = await make_user(db_async)
    user.password_setup_pending = True
    await db_async.commit()
    headers = await _headers(db_async, user)
    sent = _capture_code_emails(monkeypatch)
    await async_client.post(START_CODE, headers=headers)
    _, code = sent[0]

    first = await async_client.patch(
        ME, json={"email": random_email(), "email_code": code}, headers=headers
    )
    assert first.status_code == 200
    # The change clears the mailbox proof and signs out every session. A code-only
    # account must then prove the new address by a code sign-in, so the replay is
    # tried on a session that passes that gate: the consumed code must still fail.
    challenges = (
        await db_async.scalars(
            select(AuthChallenge).where(
                AuthChallenge.purpose == email_change_module.CODE_PURPOSE
            )
        )
    ).all()
    assert challenges == []
    user.email_verified_at = utc_now()
    await db_async.commit()
    replay_headers = await _headers(db_async, user)
    second = await async_client.patch(
        ME, json={"email": random_email(), "email_code": code}, headers=replay_headers
    )
    assert second.status_code == 400, second.text


async def test_code_request_is_refused_for_a_password_account(
    async_client, db_async, monkeypatch
):
    user = await make_user(db_async)
    headers = await _headers(db_async, user)
    sent = _capture_code_emails(monkeypatch)

    response = await async_client.post(START_CODE, headers=headers)

    assert response.status_code == 400
    assert sent == []


class _OncePerKey:
    """Cooldown stand-in: each key is allowed once."""

    def __init__(self) -> None:
        self.seen: set[str] = set()

    async def allow(self, key: str) -> bool:
        if key in self.seen:
            return False
        self.seen.add(key)
        return True


async def test_code_requests_are_rate_limited_per_account(
    async_client, db_async, monkeypatch
):
    user = await make_user(db_async)
    user.password_setup_pending = True
    await db_async.commit()
    headers = await _headers(db_async, user)
    _capture_code_emails(monkeypatch)
    # The real cooldown is Redis-backed; CI has no Redis, so use a stand-in.
    monkeypatch.setattr(email_change_module, "email_code_cooldown", _OncePerKey())

    first = await async_client.post(START_CODE, headers=headers)
    second = await async_client.post(START_CODE, headers=headers)

    assert first.status_code == 200
    assert second.status_code == 429


async def test_email_change_attempts_are_rate_limited_per_account(
    async_client, db_async, monkeypatch
):
    user = await make_user(db_async)
    headers = await _headers(db_async, user)
    monkeypatch.setattr(limiter, "enabled", True)
    monkeypatch.setattr(email_change_module, "ATTEMPT_LIMIT", "2/minute")

    statuses = []
    for _ in range(3):
        response = await async_client.patch(
            ME,
            json={"email": random_email(), "current_password": "wrong-guess"},
            headers=headers,
        )
        statuses.append(response.status_code)

    assert statuses == [400, 400, 429]


async def test_expired_code_is_refused(async_client, db_async, monkeypatch):
    user = await make_user(db_async)
    user.password_setup_pending = True
    await db_async.commit()
    headers = await _headers(db_async, user)
    sent = _capture_code_emails(monkeypatch)
    await async_client.post(START_CODE, headers=headers)
    _, code = sent[0]
    monkeypatch.setattr(
        app_service, "utc_now", lambda: utc_now() + timedelta(minutes=30)
    )

    response = await async_client.patch(
        ME, json={"email": random_email(), "email_code": code}, headers=headers
    )

    assert response.status_code == 400


async def test_proof_is_checked_before_the_duplicate_address_answer(
    async_client, db_async
):
    """A signed-in person without proof learns nothing about other addresses."""
    user = await make_user(db_async)
    other = await make_user(db_async)
    headers = await _headers(db_async, user)

    missing = await async_client.patch(ME, json={"email": other.email}, headers=headers)
    wrong = await async_client.patch(
        ME,
        json={"email": other.email, "current_password": "not-the-password"},
        headers=headers,
    )

    assert missing.status_code == 400
    assert missing.json()["detail"].startswith(PROOF_DETAIL)
    assert wrong.status_code == 400
    assert wrong.json()["detail"] == "Your current password is not correct."

    # With the right proof the same request reaches the duplicate check.
    proven = await async_client.patch(
        ME,
        json={"email": other.email, "current_password": "password123"},
        headers=headers,
    )
    assert proven.status_code == 409


async def test_sign_in_code_cannot_prove_an_email_change(async_client, db_async):
    """A sign-in code for the account is a different purpose and is refused here.

    Control: the refused change does not consume the code, which still signs in."""
    user = await make_user(db_async)
    user.password_setup_pending = True
    await db_async.commit()
    headers = await _headers(db_async, user)
    account = app_service._account()
    code = await app_service._issue_code(
        db_async,
        purpose=f"code:{account.key}",
        target=user.email,
        user_id=user.id,
    )
    await db_async.commit()

    refused = await async_client.patch(
        ME, json={"email": random_email(), "email_code": code}, headers=headers
    )
    assert refused.status_code == 400
    await db_async.refresh(user)
    assert user.password_setup_pending is True

    signed_in = await async_client.post(
        "/api/v1/auth/email-code/verify",
        json={"email": user.email, "code": code},
    )
    assert signed_in.status_code == 200


async def test_email_change_code_cannot_sign_in(async_client, db_async, monkeypatch):
    user = await make_user(db_async)
    user.password_setup_pending = True
    await db_async.commit()
    headers = await _headers(db_async, user)
    sent = _capture_code_emails(monkeypatch)
    await async_client.post(START_CODE, headers=headers)
    _, code = sent[0]

    response = await async_client.post(
        "/api/v1/auth/email-code/verify",
        json={"email": user.email, "code": code},
    )

    assert response.status_code == 400


async def test_two_step_enrolment_code_cannot_prove_an_email_change(
    async_client, db_async
):
    user = await make_user(db_async)
    user.password_setup_pending = True
    await db_async.commit()
    headers = await _headers(db_async, user)
    code = await app_service._issue_code(
        db_async,
        purpose=totp_enrolment.ENROLMENT_CODE_PURPOSE,
        target=user.email,
        user_id=user.id,
    )
    await db_async.commit()

    response = await async_client.patch(
        ME, json={"email": random_email(), "email_code": code}, headers=headers
    )

    assert response.status_code == 400
    await db_async.refresh(user)
    assert user.password_setup_pending is True


async def test_a_change_signs_out_every_session_of_the_user(async_client, db_async):
    user = await make_user(db_async)
    headers = await _headers(db_async, user)
    # An app-scoped session of the same person must end too.
    await service.create_session(
        session=db_async,
        user=user,
        client_type="web",
        app_name="bookings",
        enforce_approval=False,
    )
    await db_async.commit()
    before = await db_async.scalar(
        select(func.count())
        .select_from(AuthSession)
        .where(AuthSession.user_id == user.id)
    )
    assert before >= 2

    response = await async_client.patch(
        ME,
        json={"email": random_email(), "current_password": "password123"},
        headers=headers,
    )

    assert response.status_code == 200
    after = await db_async.scalar(
        select(func.count())
        .select_from(AuthSession)
        .where(AuthSession.user_id == user.id)
    )
    assert after == 0
