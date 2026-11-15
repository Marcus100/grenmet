"""Superuser invitations and their one-visit acceptance (ADR-0059 rule 1)."""

import json
import uuid
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import app_service, service, totp
from src.auth.config import auth_settings
from src.auth.models import SuperuserInvitation, User
from src.auth.superuser_invitation import hash_token
from src.notifications.models import OutboundEmail
from src.utils.datetime import utc_now
from tests.factories import make_user

BASE = "/api/v1/auth/superuser-invitations"
REASON = "Operations lead for the platform, approved by the owner"


@pytest.fixture(autouse=True)
def encryption(monkeypatch):
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "disabled")
    # The emailed code is fixed so a test can enter it.
    monkeypatch.setattr(app_service, "new_code", lambda: "424242")


async def account_headers(db: AsyncSession, user: User, *, mfa: bool) -> dict[str, str]:
    db_session, _ = await service.create_session(
        session=db,
        user=user,
        client_type="web",
        app_name="auth",
        mfa_verified_at=utc_now() if mfa else None,
    )
    token, _ = service.issue_access_token_for_user(
        user=user,
        expires_delta=service.get_session_access_token_expires_delta(),
        db_session=db_session,
    )
    return {"Authorization": f"Bearer {token}"}


async def superuser_headers(
    db: AsyncSession, *, authenticator: bool = True, mfa: bool = True
) -> tuple[User, dict[str, str]]:
    """A superuser; with ``authenticator`` the account has one enrolled, and with
    ``mfa`` the session passed a two-step sign-in."""
    user = await make_user(db, superuser=True)
    if authenticator:
        user.totp_enabled = True
        user.totp_secret = totp.encrypt_secret(pyotp.random_base32())
        db.add(user)
        await db.commit()
    return user, await account_headers(db, user, mfa=mfa)


async def invite(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    email: str,
    reason: str = REASON,
) -> httpx.Response:
    return await client.post(
        BASE, headers=headers, json={"email": email, "reason": reason}
    )


async def mailed_token(db: AsyncSession, email: str) -> str:
    """The token inside the newest invitation email for this address."""
    row = (
        (
            await db.execute(
                select(OutboundEmail)
                .where(
                    OutboundEmail.to_email == email,
                    OutboundEmail.template == "superuser-invitation",
                )
                .order_by(OutboundEmail.created_at.desc())
            )
        )
        .scalars()
        .first()
    )
    assert row is not None
    link = row.props["acceptLink"]
    return parse_qs(urlparse(link).query)["token"][0]


async def grant_rows(db: AsyncSession, user: User) -> list[AuditEntry]:
    return list(
        (
            await db.execute(
                select(AuditEntry).where(
                    AuditEntry.record_type == "account",
                    AuditEntry.record_id == str(user.id),
                    AuditEntry.action == "superuser_granted",
                )
            )
        )
        .scalars()
        .all()
    )


async def test_superuser_invites_and_only_a_hash_is_stored(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    response = await invite(async_client, headers, "New.Admin@Example.org")
    assert response.status_code == 201
    body = response.json()
    assert body["email"] == "new.admin@example.org"
    assert "token" not in body
    token = await mailed_token(db_async, "new.admin@example.org")
    row = await db_async.get(SuperuserInvitation, uuid.UUID(body["id"]))
    assert row is not None
    assert row.token_hash == hash_token(token)
    assert row.token_hash != token
    assert row.reason == REASON


async def test_invitation_list_and_revoke_refuse_non_superusers(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    plain = await make_user(db_async)
    headers = await account_headers(db_async, plain, mfa=True)
    assert (await invite(async_client, headers, "x@example.org")).status_code == 403
    assert (await async_client.get(BASE, headers=headers)).status_code == 403


async def test_superuser_without_authenticator_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async, authenticator=False, mfa=False)
    response = await invite(async_client, headers, "x@example.org")
    assert response.status_code == 403
    assert "superuser_mfa_required" in response.json()["detail"]


async def test_session_without_two_step_sign_in_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async, mfa=False)
    response = await invite(async_client, headers, "x@example.org")
    assert response.status_code == 403


@pytest.mark.parametrize(
    "reason",
    ["too short", "x" * 501, "bad\x00reason is here"],
)
async def test_reason_must_be_ten_to_five_hundred_characters(
    async_client: httpx.AsyncClient, db_async: AsyncSession, reason: str
) -> None:
    _, headers = await superuser_headers(db_async)
    response = await invite(async_client, headers, "x@example.org", reason=reason)
    assert response.status_code == 422


async def test_inactive_and_placeholder_addresses_are_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    gone = await make_user(db_async, email="gone@example.org")
    gone.is_active = False
    db_async.add(gone)
    await db_async.commit()
    assert (await invite(async_client, headers, "gone@example.org")).status_code == 400
    assert (
        await invite(async_client, headers, "deleted-abc@example.com")
    ).status_code == 400


async def test_invitations_are_rate_limited_per_inviter(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    for index in range(5):
        response = await invite(async_client, headers, f"person{index}@example.org")
        assert response.status_code == 201
    response = await invite(async_client, headers, "person6@example.org")
    assert response.status_code == 429


async def test_list_shows_open_invitations_without_tokens(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    created = (await invite(async_client, headers, "list@example.org")).json()
    listed = await async_client.get(BASE, headers=headers)
    assert listed.status_code == 200
    assert [row["id"] for row in listed.json()] == [created["id"]]
    assert "token" not in listed.text


async def test_revoked_invitation_stops_working(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    created = (await invite(async_client, headers, "revoke@example.org")).json()
    token = await mailed_token(db_async, "revoke@example.org")
    revoked = await async_client.post(f"{BASE}/{created['id']}/revoke", headers=headers)
    assert revoked.status_code == 200
    again = await async_client.post(f"{BASE}/{created['id']}/revoke", headers=headers)
    assert again.status_code == 409
    assert (await async_client.get(BASE, headers=headers)).json() == []
    accept = await async_client.post(
        f"{BASE}/accept", json={"token": token, "code": "424242"}
    )
    assert accept.status_code == 400


async def test_invitee_accepts_with_emailed_code_and_one_audit_row(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    inviter, headers = await superuser_headers(db_async)
    await invite(async_client, headers, "ops@example.org")
    token = await mailed_token(db_async, "ops@example.org")

    sent = await async_client.post(f"{BASE}/code", json={"token": token})
    assert sent.status_code == 200
    accepted = await async_client.post(
        f"{BASE}/accept", json={"token": token, "code": "424242"}
    )
    assert accepted.status_code == 200
    session_token = accepted.json()["access_token"]

    invitee = (
        await db_async.execute(select(User).where(User.email == "ops@example.org"))
    ).scalar_one()
    await db_async.refresh(invitee)
    assert invitee.is_superuser is True
    assert invitee.registration_pending is False
    assert invitee.email_verified_at is not None

    rows = await grant_rows(db_async, invitee)
    assert len(rows) == 1
    rendered = json.dumps(rows[0].changes)
    assert str(inviter.id) in rendered
    assert str(invitee.id) in rendered
    assert REASON in rendered

    # The new session is an ordinary account session: no app claim, so account
    # routes accept it.
    me = await async_client.get(
        "/api/v1/auth/users/me/security",
        headers={"Authorization": f"Bearer {session_token}"},
    )
    assert me.status_code == 200

    replay = await async_client.post(
        f"{BASE}/accept", json={"token": token, "code": "424242"}
    )
    assert replay.status_code == 400
    assert len(await grant_rows(db_async, invitee)) == 1


async def test_wrong_code_is_refused_and_the_invitation_stays_open(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    await invite(async_client, headers, "guess@example.org")
    token = await mailed_token(db_async, "guess@example.org")
    await async_client.post(f"{BASE}/code", json={"token": token})
    wrong = await async_client.post(
        f"{BASE}/accept", json={"token": token, "code": "000000"}
    )
    assert wrong.status_code == 400
    right = await async_client.post(
        f"{BASE}/accept", json={"token": token, "code": "424242"}
    )
    assert right.status_code == 200


async def test_code_for_another_address_does_not_open_this_invitation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    await invite(async_client, headers, "first@example.org")
    await invite(async_client, headers, "second@example.org")
    first = await mailed_token(db_async, "first@example.org")
    second = await mailed_token(db_async, "second@example.org")
    await async_client.post(f"{BASE}/code", json={"token": first})
    # The code was sent to the first address; the second invitation never got one.
    response = await async_client.post(
        f"{BASE}/accept", json={"token": second, "code": "424242"}
    )
    assert response.status_code == 400


async def test_expired_invitation_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    created = (await invite(async_client, headers, "late@example.org")).json()
    row = await db_async.get(SuperuserInvitation, uuid.UUID(created["id"]))
    assert row is not None
    row.expires_at = utc_now() - timedelta(minutes=1)
    db_async.add(row)
    await db_async.commit()
    token = await mailed_token(db_async, "late@example.org")
    response = await async_client.post(
        f"{BASE}/accept", json={"token": token, "code": "424242"}
    )
    assert response.status_code == 400


async def test_inactive_account_at_acceptance_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    await invite(async_client, headers, "sleeping@example.org")
    token = await mailed_token(db_async, "sleeping@example.org")
    account = await make_user(db_async, email="sleeping@example.org")
    account.is_active = False
    db_async.add(account)
    await db_async.commit()
    await async_client.post(f"{BASE}/code", json={"token": token})
    response = await async_client.post(
        f"{BASE}/accept", json={"token": token, "code": "424242"}
    )
    assert response.status_code == 400
    await db_async.refresh(account)
    assert account.is_superuser is False


async def test_unverified_self_registered_account_is_cleared_before_the_grant(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """Someone else may have registered this address and enrolled an authenticator
    before the owner was invited. The grant must not inherit that."""
    _, headers = await superuser_headers(db_async)
    await invite(async_client, headers, "squat@example.org")
    token = await mailed_token(db_async, "squat@example.org")
    squatter = await make_user(db_async, email="squat@example.org", verified=False)
    squatter.registration_pending = True
    squatter.totp_enabled = True
    squatter.totp_secret = totp.encrypt_secret(pyotp.random_base32())
    squatter.mfa_recovery_hashes = ["abc"]
    db_async.add(squatter)
    await db_async.commit()
    await async_client.post(f"{BASE}/code", json={"token": token})
    response = await async_client.post(
        f"{BASE}/accept", json={"token": token, "code": "424242"}
    )
    assert response.status_code == 200
    await db_async.refresh(squatter)
    assert squatter.is_superuser is True
    assert squatter.totp_enabled is False
    assert squatter.totp_secret is None
    assert squatter.mfa_recovery_hashes == []


async def test_fallback_email_carries_the_link_and_escapes_the_inviter() -> None:
    from src.notifications.dispatch import _render_content

    _, html = await _render_content(
        subject="s",
        html=None,
        template="superuser-invitation",
        props={
            "projectName": "Barrels Grenada",
            "inviterName": "<script>x</script>",
            "acceptLink": "https://auth.example.test/superuser-invite?token=abc",
            "validHours": 24,
        },
    )
    assert "https://auth.example.test/superuser-invite?token=abc" in html
    assert "<script>x</script>" not in html
    assert "expires in 24 hours" in html
