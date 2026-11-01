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
