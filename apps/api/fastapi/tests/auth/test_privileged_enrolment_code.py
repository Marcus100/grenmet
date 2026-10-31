"""Issue #625: a privileged account confirms its first authenticator with an emailed code.

The attack this closes: a stolen password for a privileged account with no
authenticator used to be enough to enrol the attacker's own authenticator.
"""

import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select

from src.audit.models import AuditEntry
from src.auth import app_service, devices, service, totp_enrolment
from src.auth.config import auth_settings
from src.auth.modern_models import AuthChallenge
from src.exceptions import AppException
from src.utils.datetime import utc_now
from tests.factories import make_user

SETUP = "/api/v1/auth/users/me/security/2fa/setup"
ACTIVATE = "/api/v1/auth/users/me/security/2fa/activate"
CODE = "424242"


@pytest.fixture(autouse=True)
def encryption(monkeypatch):
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "disabled")
    monkeypatch.setattr(app_service, "new_code", lambda: CODE)


async def login(client, user):
    return await client.post(
        "/api/v1/auth/sessions",
        json={"email": user.email, "password": "password123"},
    )


async def bearer(client, user) -> dict[str, str]:
    token = (await login(client, user)).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _record(sink: list[str], code: str) -> None:
    sink.append(code)


async def enrolment_challenges(db):
    return (
        await db.scalars(
            select(AuthChallenge).where(
                AuthChallenge.purpose == totp_enrolment.ENROLMENT_CODE_PURPOSE
            )
        )
    ).all()


async def audit_actions(db, user) -> list[str]:
    return list(
        (
            await db.scalars(
                select(AuditEntry.action)
                .where(
                    AuditEntry.record_type == "account_security",
                    AuditEntry.record_id == str(user.id),
                )
                .order_by(AuditEntry.created_at)
            )
        ).all()
    )


async def test_password_alone_cannot_enrol_a_privileged_authenticator(
    async_client, db_async
):
    """The attack path: password sign-in, setup, then activate with a TOTP only."""
    victim = await make_user(db_async, superuser=True)
    headers = await bearer(async_client, victim)
    setup = await async_client.post(SETUP, headers=headers)
    assert setup.status_code == 200
    assert setup.json()["email_code_required"] is True
    attacker_code = pyotp.TOTP(setup.json()["secret"]).now()

    activated = await async_client.post(
        ACTIVATE, json={"code": attacker_code}, headers=headers
    )
    assert activated.status_code == 400
    await db_async.refresh(victim)
    assert victim.totp_enabled is False


async def test_emailed_code_and_totp_enable_a_privileged_account(
    async_client, db_async, monkeypatch
):
    added: list[str] = []
    monkeypatch.setattr(
        devices,
        "schedule_authenticator_added_alert",
        lambda *, email_to: added.append(email_to),
    )
    user = await make_user(db_async, superuser=True)
    headers = await bearer(async_client, user)
    secret = (await async_client.post(SETUP, headers=headers)).json()["secret"]

    activated = await async_client.post(
        ACTIVATE,
        json={"code": pyotp.TOTP(secret).now(), "email_code": CODE},
        headers=headers,
    )
    assert activated.status_code == 200
    assert activated.json()["enabled"] is True
    await db_async.refresh(user)
    assert user.totp_enabled is True
    # The notification to the account goes out when an authenticator is added.
    assert added == [user.email]
    # The code is single use: the stored challenge is gone after success.
    assert await enrolment_challenges(db_async) == []
    assert "totp_enabled" in await audit_actions(db_async, user)


async def test_missing_email_code_is_refused_and_audited(async_client, db_async):
    user = await make_user(db_async, superuser=True)
    headers = await bearer(async_client, user)
    secret = (await async_client.post(SETUP, headers=headers)).json()["secret"]

    response = await async_client.post(
        ACTIVATE, json={"code": pyotp.TOTP(secret).now()}, headers=headers
    )
    assert response.status_code == 400
    assert "emailed you" in response.json()["detail"]
    assert "enrol_code_bad" in await audit_actions(db_async, user)
    await db_async.refresh(user)
    assert user.totp_enabled is False


async def test_wrong_email_code_is_refused_and_correct_one_still_works(
    async_client, db_async
):
    user = await make_user(db_async, superuser=True)
    headers = await bearer(async_client, user)
    secret = (await async_client.post(SETUP, headers=headers)).json()["secret"]

    wrong = await async_client.post(
        ACTIVATE,
        json={"code": pyotp.TOTP(secret).now(), "email_code": "000000"},
        headers=headers,
    )
    assert wrong.status_code == 400
    ok = await async_client.post(
        ACTIVATE,
        json={"code": pyotp.TOTP(secret).now(), "email_code": CODE},
        headers=headers,
    )
    assert ok.status_code == 200


async def test_a_wrong_totp_does_not_use_up_the_emailed_code(async_client, db_async):
    user = await make_user(db_async, superuser=True)
    headers = await bearer(async_client, user)
    secret = (await async_client.post(SETUP, headers=headers)).json()["secret"]

    bad_totp = await async_client.post(
        ACTIVATE, json={"code": "000000", "email_code": CODE}, headers=headers
    )
    assert bad_totp.status_code == 400
    assert len(await enrolment_challenges(db_async)) == 1
    ok = await async_client.post(
        ACTIVATE,
        json={"code": pyotp.TOTP(secret).now(), "email_code": CODE},
        headers=headers,
    )
    assert ok.status_code == 200


async def test_a_newer_setup_replaces_the_older_code(
    async_client, db_async, monkeypatch
):
    user = await make_user(db_async, superuser=True)
    headers = await bearer(async_client, user)
    await async_client.post(SETUP, headers=headers)
    monkeypatch.setattr(app_service, "new_code", lambda: "515151")
    secret = (await async_client.post(SETUP, headers=headers)).json()["secret"]

    old = await async_client.post(
        ACTIVATE,
        json={"code": pyotp.TOTP(secret).now(), "email_code": CODE},
        headers=headers,
    )
    assert old.status_code == 400
    new = await async_client.post(
        ACTIVATE,
        json={"code": pyotp.TOTP(secret).now(), "email_code": "515151"},
        headers=headers,
    )
    assert new.status_code == 200


async def test_an_expired_code_is_refused(async_client, db_async):
    from datetime import timedelta

    user = await make_user(db_async, superuser=True)
    headers = await bearer(async_client, user)
    secret = (await async_client.post(SETUP, headers=headers)).json()["secret"]
    for challenge in await enrolment_challenges(db_async):
        challenge.expires_at = utc_now() - timedelta(seconds=1)
    await db_async.commit()

    response = await async_client.post(
        ACTIVATE,
        json={"code": pyotp.TOTP(secret).now(), "email_code": CODE},
        headers=headers,
    )
    assert response.status_code == 400
    await db_async.refresh(user)
    assert user.totp_enabled is False


async def test_five_wrong_guesses_lock_the_code(async_client, db_async):
    user = await make_user(db_async, superuser=True)
    headers = await bearer(async_client, user)
    secret = (await async_client.post(SETUP, headers=headers)).json()["secret"]

    for _ in range(app_service.MAX_CODE_ATTEMPTS):
        await async_client.post(
            ACTIVATE,
            json={"code": pyotp.TOTP(secret).now(), "email_code": "000000"},
            headers=headers,
        )
    locked = await async_client.post(
        ACTIVATE,
        json={"code": pyotp.TOTP(secret).now(), "email_code": CODE},
        headers=headers,
    )
    assert locked.status_code == 400
    await db_async.refresh(user)
    assert user.totp_enabled is False


async def test_setup_is_rate_limited_per_account(async_client, db_async, monkeypatch):
    sent: list[str] = []
    monkeypatch.setattr(
        totp_enrolment,
        "_send_enrolment_code",
        lambda **kwargs: _record(sent, kwargs["code"]),
    )
    user = await make_user(db_async, superuser=True)
    headers = await bearer(async_client, user)
    for _ in range(totp_enrolment.ENROLMENT_CODES_PER_WINDOW):
        assert (await async_client.post(SETUP, headers=headers)).status_code == 200
    limited = await async_client.post(SETUP, headers=headers)
    assert limited.status_code == 429
    assert len(sent) == totp_enrolment.ENROLMENT_CODES_PER_WINDOW


async def test_old_codes_outside_the_window_do_not_count(async_client, db_async):
    from datetime import timedelta

    user = await make_user(db_async, superuser=True)
    headers = await bearer(async_client, user)
    for _ in range(totp_enrolment.ENROLMENT_CODES_PER_WINDOW):
        await async_client.post(SETUP, headers=headers)
    for entry in (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.action == totp_enrolment.ENROLMENT_CODE_SENT
            )
        )
    ).all():
        entry.created_at = utc_now() - timedelta(hours=1)
    await db_async.commit()
    assert (await async_client.post(SETUP, headers=headers)).status_code == 200


async def test_non_privileged_account_is_unchanged(async_client, db_async, monkeypatch):
    sent: list[str] = []
    monkeypatch.setattr(
        totp_enrolment,
        "_send_enrolment_code",
        lambda **kwargs: _record(sent, kwargs["code"]),
    )
    user = await make_user(db_async)
    headers = await bearer(async_client, user)
    setup = await async_client.post(SETUP, headers=headers)
    assert setup.status_code == 200
    assert setup.json()["email_code_required"] is False
    activated = await async_client.post(
        ACTIVATE,
        json={"code": pyotp.TOTP(setup.json()["secret"]).now()},
        headers=headers,
    )
    assert activated.status_code == 200
    assert sent == []
    assert await enrolment_challenges(db_async) == []


async def test_enrolment_code_is_emailed_to_the_account(
    async_client, db_async, monkeypatch
):
    sent: list[dict] = []

    def fake_send(**kwargs):
        sent.append(kwargs)

    import src.email as email_module
    from src.email_config import email_settings

    monkeypatch.setattr(email_module, "send_email", fake_send)
    monkeypatch.setattr(
        type(email_settings), "EMAILS_ENABLED", property(lambda self: True)
    )
    user = await make_user(db_async, superuser=True)
    headers = await bearer(async_client, user)
    assert (await async_client.post(SETUP, headers=headers)).status_code == 200
    assert len(sent) == 1
    assert sent[0]["email_to"] == user.email
    assert CODE in sent[0]["subject"]
    assert CODE in sent[0]["html_content"]


async def test_service_level_activation_needs_the_emailed_code_for_privileged(
    db_async,
):
    user = await make_user(db_async, superuser=True)
    secret = await service.begin_totp_setup(session=db_async, user=user)
    with pytest.raises(AppException, match="emailed you"):
        await service.activate_totp(
            session=db_async, user=user, code=pyotp.TOTP(secret).now()
        )
    assert await service.activate_totp(
        session=db_async,
        user=user,
        code=pyotp.TOTP(secret).now(),
        email_code=CODE,
    )
