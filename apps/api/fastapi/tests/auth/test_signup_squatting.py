"""Pre-registration squatting, the retired password sign-up, and the send limits (#958).

The attack: someone registers a victim's address with their own password. The
fix has two parts, both tested here: the public password sign-up never creates
an account, and the first verified emailed code clears any password that was
set before the mailbox was proven, revokes every session and audits it.
"""

import time

import pytest
from fakeredis import FakeAsyncRedis
from sqlalchemy import select

from src.audit.models import AuditEntry
from src.auth import app_service, modern_service
from src.auth.app_schemas import AppEmailCodeStart
from src.auth.lockout import LoginLockout, normalised_address
from src.auth.modern_service import drain_setup_emails
from tests.auth.test_account_lifecycle import make_self_signup_user

BASE = "/api/v1/auth"


def _limit(max_attempts: int, prefix: str) -> LoginLockout:
    return LoginLockout(
        redis_url=None,
        max_attempts=max_attempts,
        lockout_seconds=3600,
        window_seconds=3600,
        client=FakeAsyncRedis(decode_responses=True),
        prefix=prefix,
    )


def _spy_issue(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    issued: list[str] = []
    real = app_service._issue_code

    async def counting(*args, **kwargs):
        issued.append(kwargs.get("target", ""))
        return await real(*args, **kwargs)

    monkeypatch.setattr(app_service, "_issue_code", counting)
    return issued


@pytest.mark.asyncio
async def test_squatted_password_is_cleared_by_the_owners_first_code(
    async_client, db_async, monkeypatch
):
    victim = "victim.squat@example.com"
    attacker_password = "attacker-chosen-password"
    await make_self_signup_user(
        db_async,
        email=victim,
        username="victimsquat",
        password=attacker_password,
        first_name="Victim",
        last_name="Person",
    )
    # Before the owner proves the mailbox, the attacker's password works.
    attacker = await async_client.post(
        f"{BASE}/sessions", json={"email": victim, "password": attacker_password}
    )
    assert attacker.status_code == 200
    attacker_session = attacker.json()["session_token"]

    # The owner signs in with the emailed code.
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    monkeypatch.setattr(app_service, "send_email", lambda **kwargs: None)
    await async_client.post(f"{BASE}/email-code/start", json={"email": victim})
    owner = await async_client.post(
        f"{BASE}/email-code/verify", json={"email": victim, "code": "123456"}
    )
    assert owner.status_code == 200

    # The attacker's password no longer opens the account ...
    retry = await async_client.post(
        f"{BASE}/sessions", json={"email": victim, "password": attacker_password}
    )
    assert retry.status_code != 200
    # ... and the attacker's session is gone.
    exchanged = await async_client.post(
        f"{BASE}/sessions/access-token", json={"session_token": attacker_session}
    )
    assert exchanged.status_code == 401
    # The clearing is audited, without any secret.
    entries = (
        (
            await db_async.execute(
                select(AuditEntry).where(AuditEntry.action == "pw_retired")
            )
        )
        .scalars()
        .all()
    )
    assert entries
    assert all(attacker_password not in str(entry.changes) for entry in entries)


def test_mailbox_keys_fold_aliases_and_keep_other_domains() -> None:
    assert normalised_address("Jane.Doe+news@Gmail.com") == "janedoe@gmail.com"
    assert normalised_address("jane@googlemail.com") == "jane@gmail.com"
    assert normalised_address("a.b+x@example.com") == "a.b@example.com"


@pytest.mark.asyncio
async def test_aliases_share_one_send_cap(async_client, db_async, monkeypatch):
    _ = db_async
    monkeypatch.setattr(app_service, "email_code_send_limit", _limit(2, "codesend"))
    monkeypatch.setattr(app_service, "send_email", lambda **kwargs: None)
    issued = _spy_issue(monkeypatch)
    for address in ("a.b+1@gmail.com", "ab@gmail.com", "a.b+2@googlemail.com"):
        response = await async_client.post(
            f"{BASE}/email-code/start", json={"email": address}
        )
        assert response.status_code == 200
    assert len(issued) == 2


@pytest.mark.asyncio
async def test_cooldown_ignores_a_second_request_for_the_same_mailbox(
    async_client, db_async, monkeypatch
):
    _ = db_async
    monkeypatch.setattr(app_service, "email_code_cooldown", _limit(1, "codecool"))
    monkeypatch.setattr(app_service, "send_email", lambda **kwargs: None)
    issued = _spy_issue(monkeypatch)
    first = await async_client.post(
        f"{BASE}/email-code/start", json={"email": "cool@example.com"}
    )
    second = await async_client.post(
        f"{BASE}/email-code/start", json={"email": "cool@example.com"}
    )
    assert first.json() == second.json()
    assert len(issued) == 1


@pytest.mark.asyncio
async def test_per_address_ip_cap_stops_a_burst_from_one_client(db_async, monkeypatch):
    monkeypatch.setattr(app_service, "email_code_ip_limit", _limit(2, "codeip"))
    monkeypatch.setattr(app_service, "send_email", lambda **kwargs: None)
    issued = _spy_issue(monkeypatch)
    for index in range(4):
        await app_service.account_email_code_start(
            session=db_async,
            body=AppEmailCodeStart(email=f"burst{index}@example.com"),
            client_ip="203.0.113.9",
        )
    assert len(issued) == 2


@pytest.mark.asyncio
async def test_password_setup_reply_is_the_same_known_unknown_and_failed(
    async_client, db_async, monkeypatch
):
    _ = db_async
    known = await make_self_signup_user(
        db_async,
        email="known.setup@example.com",
        username="knownsetup",
        password="password-for-known",
        first_name="K",
        last_name="S",
    )
    _ = known
    monkeypatch.setattr(
        modern_service,
        "send_email",
        lambda **kwargs: (_ for _ in ()).throw(RuntimeError("smtp down")),
    )
    replies = []
    for address in ("known.setup@example.com", "nobody.setup@example.com"):
        response = await async_client.post(
            f"{BASE}/password/setup", json={"email": address}
        )
        assert response.status_code == 200
        replies.append(response.json())
    await drain_setup_emails()
    assert replies[0] == replies[1]


@pytest.mark.asyncio
async def test_password_setup_reply_does_not_wait_for_the_mail_provider(
    async_client, db_async, monkeypatch
):
    await make_self_signup_user(
        db_async,
        email="slow.setup@example.com",
        username="slowsetup",
        password="password-for-slow",
        first_name="S",
        last_name="L",
    )
    monkeypatch.setattr(
        modern_service,
        "send_email",
        lambda **kwargs: time.sleep(1.5),
    )
    started = time.perf_counter()
    response = await async_client.post(
        f"{BASE}/password/setup", json={"email": "slow.setup@example.com"}
    )
    elapsed = time.perf_counter() - started
    assert response.status_code == 200
    assert elapsed < 1.0, f"reply waited {elapsed:.2f}s on the mail provider"
    await drain_setup_emails()


@pytest.mark.asyncio
async def test_password_setup_is_capped_per_address(
    async_client, db_async, monkeypatch
):
    await make_self_signup_user(
        db_async,
        email="capped.setup@example.com",
        username="cappedsetup",
        password="password-for-capped",
        first_name="C",
        last_name="S",
    )
    monkeypatch.setattr(
        modern_service, "password_setup_send_limit", _limit(2, "setupsend")
    )
    sent: list[str] = []
    monkeypatch.setattr(
        modern_service, "send_email", lambda **kwargs: sent.append(kwargs["email_to"])
    )
    for _ in range(4):
        response = await async_client.post(
            f"{BASE}/password/setup", json={"email": "capped.setup@example.com"}
        )
        assert response.status_code == 200
    await drain_setup_emails()
    assert len(sent) == 2


@pytest.mark.asyncio
async def test_squatter_authenticator_and_links_are_cleared_before_the_owner_signs_in(
    async_client, db_async, monkeypatch
):
    """F2: a squatter's authenticator must not block the owner's code sign-in."""
    from sqlalchemy import select as sa_select

    from src.auth.models import User
    from src.auth.modern_models import ExternalIdentity

    victim = "victim.totp@example.com"
    squatter = await make_self_signup_user(
        db_async,
        email=victim,
        username="victimtotp",
        password="squatter-password-here",
        first_name="V",
        last_name="T",
    )
    user = (
        await db_async.execute(sa_select(User).where(User.id == squatter))
    ).scalar_one()
    user.totp_enabled = True
    user.totp_secret = "JBSWY3DPEHPK3PXP"
    user.mfa_recovery_hashes = ["deadbeef"]
    user.known_device_keys = ["Chrome on Linux"]
    db_async.add(
        ExternalIdentity(subject="google-sub-1", provider="google", user_id=squatter)
    )
    await db_async.commit()

    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    monkeypatch.setattr(app_service, "send_email", lambda **kwargs: None)
    await async_client.post(f"{BASE}/email-code/start", json={"email": victim})
    owner = await async_client.post(
        f"{BASE}/email-code/verify", json={"email": victim, "code": "123456"}
    )
    # Without the retirement first, the squatter's TOTP would demand a code here.
    assert owner.status_code == 200, owner.text

    await db_async.refresh(user)
    assert user.totp_enabled is False
    assert user.totp_secret is None
    assert user.mfa_recovery_hashes == []
    assert user.known_device_keys == []
    links = (
        (
            await db_async.execute(
                sa_select(ExternalIdentity).where(ExternalIdentity.user_id == squatter)
            )
        )
        .scalars()
        .all()
    )
    assert links == []


@pytest.mark.asyncio
async def test_administrator_created_password_survives_the_owners_code(
    async_client, db_async, monkeypatch
):
    """F8: accounts an administrator created with a password are not retired."""
    from src.auth.schemas import UserCreate
    from src.auth.service import create_user

    admin_made = "admin.made@example.com"
    await create_user(
        session=db_async,
        user_create=UserCreate(
            email=admin_made,
            username="adminmade",
            password="admin-set-password-1",
            first_name="Admin",
            last_name="Made",
        ),
    )
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    monkeypatch.setattr(app_service, "send_email", lambda **kwargs: None)
    await async_client.post(f"{BASE}/email-code/start", json={"email": admin_made})
    await async_client.post(
        f"{BASE}/email-code/verify", json={"email": admin_made, "code": "123456"}
    )
    still = await async_client.post(
        f"{BASE}/sessions",
        json={"email": admin_made, "password": "admin-set-password-1"},
    )
    assert still.status_code == 200


@pytest.mark.asyncio
async def test_setup_link_cap_tells_an_administrator_instead_of_succeeding(
    db_async, monkeypatch
):
    """F4: a capped resend raises 429 for the admin; the public route stays silent."""
    from starlette.requests import Request

    from src.auth import modern_service
    from src.auth.lockout import LoginLockout
    from src.auth.modern_schemas import EmailRequest
    from src.exceptions import AppException

    monkeypatch.setattr(
        modern_service,
        "password_setup_send_limit",
        LoginLockout(
            redis_url=None,
            max_attempts=0,
            lockout_seconds=1,
            window_seconds=1,
            client=FakeAsyncRedis(decode_responses=True),
        ),
    )
    request = Request(
        {
            "type": "http",
            "headers": [],
            "client": ("127.0.0.1", 1),
            "server": ("t", 80),
            "path": "/x",
        }
    )
    with pytest.raises(AppException) as raised:
        await modern_service.email_request(
            request,
            db_async,
            EmailRequest(email="cap@example.com"),
            await_delivery=True,
        )
    assert raised.value.status_code == 429


@pytest.mark.asyncio
async def test_delivery_failure_log_names_the_error_not_the_address(
    async_client, db_async, monkeypatch
):
    """F6: the log carries the exception class only, never the recipient."""
    await make_self_signup_user(
        db_async,
        email="leak.check@example.com",
        username="leakcheck",
        password="password-for-leak-check",
        first_name="L",
        last_name="C",
    )

    def boom(**kwargs):
        raise ValueError(f"provider rejected {kwargs['email_to']}")

    monkeypatch.setattr(modern_service, "send_email", boom)
    from unittest.mock import MagicMock

    log = MagicMock()
    monkeypatch.setattr(modern_service, "logger", log)
    await async_client.post(
        f"{BASE}/password/setup", json={"email": "leak.check@example.com"}
    )
    await modern_service.drain_setup_emails()
    logged = repr(log.warning.call_args_list)
    assert log.warning.called
    assert "leak.check@example.com" not in logged
    assert "ValueError" in logged
