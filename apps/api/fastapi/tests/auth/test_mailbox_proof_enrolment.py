"""ADR-0059 rules 2 and 4: one mailbox proof per visit, and setup can finish two-step sign-in.

Rule 2: authenticator set-up on a privileged account does not ask for a second emailed
code when the current session was opened by an emailed code less than ten minutes ago.
Rule 4: when rule 2 held and the authenticator code was verified in the same set-up, the
current session is marked two-step verified (``mfa_verified_at``). Every other case keeps
the emailed code (issue #625) and never upgrades a session.
"""

import uuid
from datetime import timedelta

import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select

from src.audit.models import AuditEntry
from src.auth import app_service, modern_service, service, totp_enrolment
from src.auth.config import auth_settings
from src.auth.models import Role
from src.auth.models import Session as LoginSession
from src.auth.modern_models import AuthChallenge
from src.auth.privileged_mfa import require_mfa_session
from src.utils.datetime import utc_now
from tests.factories import make_role_with_permission, make_user

BASE = "/api/v1/auth"
SETUP = f"{BASE}/users/me/security/2fa/setup"
ACTIVATE = f"{BASE}/users/me/security/2fa/activate"
CODE = "424242"
LATER_CODE = "515151"


@pytest.fixture(autouse=True)
def settings(monkeypatch):
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "disabled")
    monkeypatch.setattr(app_service, "new_code", lambda: CODE)
    monkeypatch.setattr(app_service, "send_email", lambda **_kwargs: None)


@pytest.fixture
def sent(monkeypatch) -> list[str]:
    """Records every enrolment code that would have been emailed."""
    codes: list[str] = []

    async def record(**kwargs: str) -> None:
        codes.append(kwargs["code"])

    monkeypatch.setattr(totp_enrolment, "_send_enrolment_code", record)
    return codes


async def sign_in_with_email_code(client, user) -> tuple[dict[str, str], uuid.UUID]:
    await client.post(f"{BASE}/email-code/start", json={"email": user.email})
    response = await client.post(
        f"{BASE}/email-code/verify", json={"email": user.email, "code": CODE}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    return _bearer(body), uuid.UUID(body["session"]["id"])


async def sign_in_with_password(client, user) -> tuple[dict[str, str], uuid.UUID]:
    response = await client.post(
        f"{BASE}/sessions", json={"email": user.email, "password": "password123"}
    )
    assert response.status_code == 200, response.text
    body = response.json()
    return _bearer(body), uuid.UUID(body["session"]["id"])


async def sign_in_with_google(client, db, user) -> tuple[dict[str, str], uuid.UUID]:
    token = await modern_service.issue(
        db,
        "google-login",
        user_id=user.id,
        data={"subject": f"google-{user.id}", "email": user.email},
    )
    await db.commit()
    response = await client.post(f"{BASE}/google/finish", json={"challenge": token})
    assert response.status_code == 200, response.text
    body = response.json()
    return _bearer(body), uuid.UUID(body["session"]["id"])


def _bearer(body: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {body['access_token']}"}


async def session_row(db, session_id: uuid.UUID) -> LoginSession:
    row = await db.get(LoginSession, session_id)
    assert row is not None
    await db.refresh(row)
    return row


async def age_email_proof(db, session_id: uuid.UUID, *, minutes: float) -> None:
    row = await session_row(db, session_id)
    row.email_code_verified_at = utc_now() - timedelta(minutes=minutes)
    await db.commit()


async def enrolment_challenges(db) -> list[AuthChallenge]:
    return list(
        (
            await db.scalars(
                select(AuthChallenge).where(
                    AuthChallenge.purpose == totp_enrolment.ENROLMENT_CODE_PURPOSE
                )
            )
        ).all()
    )


async def audit_actions(db, user) -> list[str]:
    return list(
        (
            await db.scalars(
                select(AuditEntry.action).where(
                    AuditEntry.record_type == "account_security",
                    AuditEntry.record_id == str(user.id),
                )
            )
        ).all()
    )


async def begin(client, headers) -> dict:
    response = await client.post(SETUP, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()


def totp(secret: str) -> str:
    return pyotp.TOTP(secret).now()


async def test_email_code_session_skips_the_second_code_and_is_upgraded_by_totp(
    async_client, db_async, sent
):
    user = await make_user(db_async, superuser=True)
    headers, session_id = await sign_in_with_email_code(async_client, user)

    setup = await begin(async_client, headers)
    assert setup["email_code_required"] is False
    assert sent == []
    assert await enrolment_challenges(db_async) == []

    activated = await async_client.post(
        ACTIVATE, json={"code": totp(setup["secret"])}, headers=headers
    )
    assert activated.status_code == 200, activated.text
    await db_async.refresh(user)
    assert user.totp_enabled is True
    row = await session_row(db_async, session_id)
    assert row.revoked_at is None
    assert row.mfa_verified_at is not None
    # The same session now passes the privileged gate, with no sign-out and in.
    await require_mfa_session(db_async, user, login_session=row)


async def test_email_code_older_than_ten_minutes_still_needs_the_emailed_code(
    async_client, db_async, sent
):
    user = await make_user(db_async, superuser=True)
    headers, session_id = await sign_in_with_email_code(async_client, user)
    await age_email_proof(db_async, session_id, minutes=11)

    setup = await begin(async_client, headers)
    assert setup["email_code_required"] is True
    assert sent == [CODE]

    without_code = await async_client.post(
        ACTIVATE, json={"code": totp(setup["secret"])}, headers=headers
    )
    assert without_code.status_code == 400
    assert "emailed you" in without_code.json()["detail"]

    activated = await async_client.post(
        ACTIVATE,
        json={"code": totp(setup["secret"]), "email_code": CODE},
        headers=headers,
    )
    assert activated.status_code == 200, activated.text
    row = await session_row(db_async, session_id)
    # Rule 2 did not hold, so rule 4 does not upgrade the session.
    assert row.mfa_verified_at is None


async def test_email_code_inside_the_window_still_skips_the_code_at_nine_minutes(
    async_client, db_async, sent
):
    user = await make_user(db_async, superuser=True)
    headers, session_id = await sign_in_with_email_code(async_client, user)
    await age_email_proof(db_async, session_id, minutes=9)

    setup = await begin(async_client, headers)
    assert setup["email_code_required"] is False
    assert sent == []


async def test_password_session_still_needs_the_emailed_code(
    async_client, db_async, sent
):
    user = await make_user(db_async, superuser=True)
    headers, session_id = await sign_in_with_password(async_client, user)

    setup = await begin(async_client, headers)
    assert setup["email_code_required"] is True
    assert sent == [CODE]
    refused = await async_client.post(
        ACTIVATE, json={"code": totp(setup["secret"])}, headers=headers
    )
    assert refused.status_code == 400
    activated = await async_client.post(
        ACTIVATE,
        json={"code": totp(setup["secret"]), "email_code": CODE},
        headers=headers,
    )
    assert activated.status_code == 200, activated.text
    row = await session_row(db_async, session_id)
    assert row.mfa_verified_at is None


async def test_google_session_still_needs_the_emailed_code(
    async_client, db_async, sent
):
    user = await make_user(db_async, superuser=True)
    headers, session_id = await sign_in_with_google(async_client, db_async, user)

    setup = await begin(async_client, headers)
    assert setup["email_code_required"] is True
    assert sent == [CODE]
    refused = await async_client.post(
        ACTIVATE, json={"code": totp(setup["secret"])}, headers=headers
    )
    assert refused.status_code == 400
    activated = await async_client.post(
        ACTIVATE,
        json={"code": totp(setup["secret"]), "email_code": CODE},
        headers=headers,
    )
    assert activated.status_code == 200, activated.text
    row = await session_row(db_async, session_id)
    assert row.mfa_verified_at is None


async def test_a_code_used_to_sign_in_cannot_stand_in_for_the_enrolment_code(
    async_client, db_async, sent, monkeypatch
):
    user = await make_user(db_async, superuser=True)
    headers, session_id = await sign_in_with_email_code(async_client, user)
    await age_email_proof(db_async, session_id, minutes=11)
    monkeypatch.setattr(app_service, "new_code", lambda: LATER_CODE)

    setup = await begin(async_client, headers)
    assert setup["email_code_required"] is True
    assert sent == [LATER_CODE]

    replayed = await async_client.post(
        ACTIVATE,
        json={"code": totp(setup["secret"]), "email_code": CODE},
        headers=headers,
    )
    assert replayed.status_code == 400
    assert "enrol_code_bad" in await audit_actions(db_async, user)
    await db_async.refresh(user)
    assert user.totp_enabled is False

    activated = await async_client.post(
        ACTIVATE,
        json={"code": totp(setup["secret"]), "email_code": LATER_CODE},
        headers=headers,
    )
    assert activated.status_code == 200, activated.text
    row = await session_row(db_async, session_id)
    assert row.mfa_verified_at is None


async def test_another_users_session_id_proves_nothing(async_client, db_async, sent):
    victim = await make_user(db_async, superuser=True)
    _, victim_session_id = await sign_in_with_email_code(async_client, victim)
    attacker = await make_user(db_async, superuser=True)
    # A token for the attacker that names the victim's freshly proven session.
    victim_row = await session_row(db_async, victim_session_id)
    token, _ = service.issue_access_token_for_user(
        user=attacker, expires_delta=timedelta(minutes=10), db_session=victim_row
    )
    headers = {"Authorization": f"Bearer {token}"}

    setup = await async_client.post(SETUP, headers=headers)
    assert setup.status_code == 200, setup.text
    assert setup.json()["email_code_required"] is True
    assert sent == [CODE]

    without_code = await async_client.post(
        ACTIVATE, json={"code": totp(setup.json()["secret"])}, headers=headers
    )
    assert without_code.status_code == 400
    await db_async.refresh(attacker)
    assert attacker.totp_enabled is False
    row = await session_row(db_async, victim_session_id)
    assert row.mfa_verified_at is None


@pytest.mark.usefixtures("sent")
async def test_another_users_session_id_is_not_upgraded_even_with_the_emailed_code(
    async_client, db_async
):
    victim = await make_user(db_async, superuser=True)
    _, victim_session_id = await sign_in_with_email_code(async_client, victim)
    attacker = await make_user(db_async, superuser=True)
    victim_row = await session_row(db_async, victim_session_id)
    token, _ = service.issue_access_token_for_user(
        user=attacker, expires_delta=timedelta(minutes=10), db_session=victim_row
    )
    headers = {"Authorization": f"Bearer {token}"}
    setup = await begin(async_client, headers)

    activated = await async_client.post(
        ACTIVATE,
        json={"code": totp(setup["secret"]), "email_code": CODE},
        headers=headers,
    )
    assert activated.status_code == 200, activated.text
    row = await session_row(db_async, victim_session_id)
    assert row.mfa_verified_at is None
    assert row.revoked_at is None


@pytest.mark.usefixtures("sent")
async def test_wrong_authenticator_code_does_not_upgrade_the_session(
    async_client, db_async
):
    user = await make_user(db_async, superuser=True)
    headers, session_id = await sign_in_with_email_code(async_client, user)
    setup = await begin(async_client, headers)
    assert setup["email_code_required"] is False

    wrong = await async_client.post(ACTIVATE, json={"code": "000000"}, headers=headers)
    assert wrong.status_code == 400
    await db_async.refresh(user)
    assert user.totp_enabled is False
    row = await session_row(db_async, session_id)
    assert row.mfa_verified_at is None
    assert row.revoked_at is None


async def test_a_proof_that_lapses_before_activation_asks_for_a_fresh_code(
    async_client, db_async, sent
):
    user = await make_user(db_async, superuser=True)
    headers, session_id = await sign_in_with_email_code(async_client, user)
    setup = await begin(async_client, headers)
    assert setup["email_code_required"] is False
    assert sent == []

    await age_email_proof(db_async, session_id, minutes=11)
    late = await async_client.post(
        ACTIVATE, json={"code": totp(setup["secret"])}, headers=headers
    )
    assert late.status_code == 400
    assert "Start two-step verification set-up again" in late.json()["detail"]
    assert await enrolment_challenges(db_async) == []
    assert "enrol_code_bad" not in await audit_actions(db_async, user)

    restarted = await begin(async_client, headers)
    assert restarted["email_code_required"] is True
    assert sent == [CODE]
    activated = await async_client.post(
        ACTIVATE,
        json={"code": totp(restarted["secret"]), "email_code": CODE},
        headers=headers,
    )
    assert activated.status_code == 200, activated.text
    row = await session_row(db_async, session_id)
    assert row.mfa_verified_at is None


@pytest.mark.usefixtures("sent")
async def test_an_ordinary_account_setup_never_upgrades_the_session(
    async_client, db_async
):
    user = await make_user(db_async, superuser=False)
    headers, session_id = await sign_in_with_email_code(async_client, user)
    setup = await begin(async_client, headers)
    assert setup["email_code_required"] is False

    activated = await async_client.post(
        ACTIVATE, json={"code": totp(setup["secret"])}, headers=headers
    )
    assert activated.status_code == 200, activated.text
    row = await session_row(db_async, session_id)
    assert row.mfa_verified_at is None


async def test_an_app_email_code_sign_in_records_the_proof(async_client, db_async):
    user = await make_user(db_async, superuser=False)
    # The app's default role is seeded at prestart; the test database may not have it.
    if (
        await db_async.scalar(select(Role.id).where(Role.name == "events-member"))
        is None
    ):
        await make_role_with_permission(
            db_async, "app.events.access", role_name="events-member"
        )
    await async_client.post(
        f"{BASE}/apps/events/email-code/start", json={"email": user.email}
    )
    response = await async_client.post(
        f"{BASE}/apps/events/email-code/verify",
        json={"email": user.email, "code": CODE},
    )
    assert response.status_code == 200, response.text
    row = await session_row(db_async, uuid.UUID(response.json()["session"]["id"]))
    assert row.email_code_verified_at is not None
    assert row.mfa_verified_at is None
