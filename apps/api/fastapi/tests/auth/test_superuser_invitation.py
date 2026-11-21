"""Superuser invitations and their one-visit acceptance (ADR-0059 rule 1)."""

import json
import uuid
from datetime import timedelta
from urllib.parse import parse_qs, urlparse

import httpx
import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import app_service, service, totp
from src.auth import superuser_invitation as invitations
from src.auth.config import auth_settings
from src.auth.lockout import normalised_address
from src.auth.models import Session as LoginSession
from src.auth.models import SuperuserInvitation, User
from src.auth.modern_models import AuthChallenge
from src.auth.placeholders import is_placeholder_email
from src.auth.superuser_invitation import accept_link, hash_token
from src.config import settings
from src.exceptions import AppException
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
    monkeypatch.setattr(settings, "FRONTEND_HOST", "https://auth.example.test")


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
    # The token lives in the fragment, never in the query string (access logs).
    assert "token=" not in urlparse(link).query
    return parse_qs(urlparse(link).fragment)["token"][0]


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

    _, html, _text = await _render_content(
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


# --- Review fixes -----------------------------------------------------------------


async def test_demoted_or_deactivated_inviter_voids_the_open_invitation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    inviter, headers = await superuser_headers(db_async)
    await invite(async_client, headers, "demoted@example.org")
    token = await mailed_token(db_async, "demoted@example.org")
    inviter.is_superuser = False
    db_async.add(inviter)
    await db_async.commit()
    await async_client.post(f"{BASE}/code", json={"token": token})
    response = await async_client.post(
        f"{BASE}/accept", json={"token": token, "code": "424242"}
    )
    assert response.status_code == 400
    invitee = (
        (
            await db_async.execute(
                select(User).where(User.email == "demoted@example.org")
            )
        )
        .scalars()
        .first()
    )
    assert invitee is None


async def test_deactivated_inviter_voids_the_open_invitation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    inviter, headers = await superuser_headers(db_async)
    await invite(async_client, headers, "off@example.org")
    token = await mailed_token(db_async, "off@example.org")
    inviter.is_active = False
    db_async.add(inviter)
    await db_async.commit()
    response = await async_client.post(
        f"{BASE}/accept", json={"token": token, "code": "424242"}
    )
    assert response.status_code == 400


async def test_offboarding_closes_the_inviters_open_invitations(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    inviter, headers = await superuser_headers(db_async)
    created = (await invite(async_client, headers, "closed@example.org")).json()
    closed = await invitations.close_for_inviter(db_async, inviter.id)
    await db_async.commit()
    assert closed == 1
    row = await db_async.get(SuperuserInvitation, uuid.UUID(created["id"]))
    assert row is not None and row.revoked_at is not None


class OncePerKey:
    """Cooldown stand-in: a key is allowed once (the real one is Redis-backed)."""

    def __init__(self) -> None:
        self.seen: set[str] = set()

    async def allow(self, key: str) -> bool:
        if key in self.seen:
            return False
        self.seen.add(key)
        return True


class AlwaysAllow:
    async def allow(self, key: str) -> bool:
        return True


async def test_invitation_code_has_its_own_mailbox_bucket(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A sign-in code for the address must not silence the invitation code."""
    monkeypatch.setattr(app_service, "email_code_cooldown", OncePerKey())
    monkeypatch.setattr(app_service, "email_code_send_limit", AlwaysAllow())
    _, headers = await superuser_headers(db_async)
    await invite(async_client, headers, "shared@example.org")
    token = await mailed_token(db_async, "shared@example.org")
    # The address's sign-in cooldown is now used up.
    key = normalised_address("shared@example.org")
    assert await app_service._code_request_allowed(None, key)
    assert not await app_service._code_request_allowed(None, key)
    await async_client.post(f"{BASE}/code", json={"token": token})
    challenges = (
        (
            await db_async.execute(
                select(AuthChallenge).where(AuthChallenge.purpose == "superuser-invite")
            )
        )
        .scalars()
        .all()
    )
    assert len(challenges) == 1


async def test_squatted_account_is_fully_cleared_and_the_grant_says_so(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    await invite(async_client, headers, "squatted@example.org")
    token = await mailed_token(db_async, "squatted@example.org")
    squatter = await make_user(db_async, email="squatted@example.org", verified=False)
    squatter.registration_pending = False
    squatter.totp_enabled = True
    squatter.totp_secret = totp.encrypt_secret(pyotp.random_base32())
    squatter.mfa_recovery_hashes = ["abc"]
    old_hash = squatter.hashed_password
    db_async.add(squatter)
    await db_async.commit()
    old_session, _ = await service.create_session(
        session=db_async, user=squatter, client_type="web", app_name="auth"
    )
    await db_async.commit()
    await async_client.post(f"{BASE}/code", json={"token": token})
    response = await async_client.post(
        f"{BASE}/accept", json={"token": token, "code": "424242"}
    )
    assert response.status_code == 200
    await db_async.refresh(squatter)
    assert squatter.hashed_password != old_hash
    assert squatter.password_setup_pending is True
    assert squatter.totp_enabled is False and squatter.totp_secret is None
    assert squatter.mfa_recovery_hashes == []
    still_there = (
        (
            await db_async.execute(
                select(LoginSession.id).where(LoginSession.id == old_session.id)
            )
        )
        .scalars()
        .first()
    )
    assert still_there is None
    rows = await grant_rows(db_async, squatter)
    assert len(rows) == 1
    assert "retired_unverified" in json.dumps(rows[0].changes)
    retired = (
        (
            await db_async.execute(
                select(AuditEntry).where(
                    AuditEntry.record_id == str(squatter.id),
                    AuditEntry.action == "pw_retired",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(retired) == 1


async def test_verified_account_with_an_authenticator_must_give_its_code(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """Mailbox access alone must not grant the flag (the emailed-code sign-in rule)."""
    _, headers = await superuser_headers(db_async)
    await invite(async_client, headers, "guarded@example.org")
    token = await mailed_token(db_async, "guarded@example.org")
    secret = pyotp.random_base32()
    holder = await make_user(db_async, email="guarded@example.org")
    holder.totp_enabled = True
    holder.totp_secret = totp.encrypt_secret(secret)
    db_async.add(holder)
    await db_async.commit()
    await async_client.post(f"{BASE}/code", json={"token": token})
    without = await async_client.post(
        f"{BASE}/accept", json={"token": token, "code": "424242"}
    )
    assert without.status_code == 400
    await db_async.refresh(holder)
    assert holder.is_superuser is False
    with_code = await async_client.post(
        f"{BASE}/accept",
        json={"token": token, "code": "424242", "totp_code": pyotp.TOTP(secret).now()},
    )
    assert with_code.status_code == 200
    await db_async.refresh(holder)
    assert holder.is_superuser is True


async def test_every_active_superuser_is_told_and_the_mail_has_no_token_or_reason(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    inviter, headers = await superuser_headers(db_async)
    await invite(async_client, headers, "notice@example.org")
    token = await mailed_token(db_async, "notice@example.org")
    mailable = {
        user.email
        for user in (
            await db_async.execute(
                select(User).where(
                    User.is_superuser.is_(True), User.is_active.is_(True)
                )
            )
        ).scalars()
        if user.email_verified_at is not None and not is_placeholder_email(user.email)
    }
    notices = (
        (
            await db_async.execute(
                select(OutboundEmail).where(OutboundEmail.template == "notification")
            )
        )
        .scalars()
        .all()
    )
    # Only active, verified, non-placeholder superusers are mailed, so the placeholder
    # and unverified ones do not bounce through the outbox.
    recipients = {row.to_email for row in notices}
    assert inviter.email in recipients
    assert recipients == mailable
    for row in notices:
        rendered = json.dumps(row.props)
        assert token not in rendered
        assert REASON not in rendered

    await async_client.post(f"{BASE}/code", json={"token": token})
    await async_client.post(f"{BASE}/accept", json={"token": token, "code": "424242"})
    accepted = [
        row
        for row in (
            await db_async.execute(
                select(OutboundEmail).where(OutboundEmail.template == "notification")
            )
        ).scalars()
        if row.props.get("title") == "Superuser invitation accepted"
    ]
    assert {row.to_email for row in accepted} >= {inviter.email}


async def test_a_new_invitation_supersedes_the_open_one_and_the_audit_says_so(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    first = (await invite(async_client, headers, "twice@example.org")).json()
    second = (await invite(async_client, headers, "twice@example.org")).json()
    pending = (await async_client.get(BASE, headers=headers)).json()
    assert [row["id"] for row in pending] == [second["id"]]
    superseded = (
        (
            await db_async.execute(
                select(AuditEntry).where(
                    AuditEntry.record_id == first["id"],
                    AuditEntry.action == "superseded",
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(superseded) == 1


async def test_inactive_account_is_refused_whatever_the_case_of_its_address(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    gone = await make_user(db_async, email="Mixed.Case@Example.org")
    gone.is_active = False
    db_async.add(gone)
    await db_async.commit()
    response = await invite(async_client, headers, "mixed.case@example.org")
    assert response.status_code == 400


async def test_acceptance_finds_the_existing_account_whatever_the_case(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    existing = await make_user(db_async, email="Case.User@Example.org")
    await invite(async_client, headers, "case.user@example.org")
    token = await mailed_token(db_async, "case.user@example.org")
    await async_client.post(f"{BASE}/code", json={"token": token})
    response = await async_client.post(
        f"{BASE}/accept", json={"token": token, "code": "424242"}
    )
    assert response.status_code == 200
    count = await db_async.scalar(
        select(func.count(User.id)).where(
            func.lower(User.email) == "case.user@example.org"
        )
    )
    assert count == 1
    await db_async.refresh(existing)
    assert existing.is_superuser is True


async def test_closed_invitations_are_purged_ninety_days_after_they_end(
    db_async: AsyncSession,
) -> None:
    inviter = await make_user(db_async, superuser=True)
    now = utc_now()
    base = {
        "reason": REASON,
        "invited_by_user_id": inviter.id,
        "created_at": now - timedelta(days=200),
    }
    db_async.add_all(
        [
            SuperuserInvitation(
                id=uuid.uuid4(),
                email="a@example.org",
                token_hash="h-a",
                expires_at=now - timedelta(days=190),
                accepted_at=now - timedelta(days=100),
                **base,
            ),
            SuperuserInvitation(
                id=uuid.uuid4(),
                email="b@example.org",
                token_hash="h-b",
                expires_at=now - timedelta(days=190),
                revoked_at=now - timedelta(days=100),
                **base,
            ),
            SuperuserInvitation(
                id=uuid.uuid4(),
                email="c@example.org",
                token_hash="h-c",
                expires_at=now - timedelta(days=100),
                **base,
            ),
            SuperuserInvitation(
                id=uuid.uuid4(),
                email="d@example.org",
                token_hash="h-d",
                expires_at=now + timedelta(days=1),
                revoked_at=now - timedelta(days=10),
                **base,
            ),
        ]
    )
    await db_async.commit()
    deleted = await invitations.purge_closed_invitations(db_async)
    await db_async.commit()
    assert deleted == 3
    left = (await db_async.execute(select(SuperuserInvitation.email))).scalars().all()
    assert left == ["d@example.org"]


def test_accept_link_keeps_the_token_in_the_fragment(monkeypatch) -> None:
    monkeypatch.setattr(settings, "FRONTEND_HOST", "https://auth.example.test/")
    assert accept_link("abc") == "https://auth.example.test/superuser-invite#token=abc"


def test_accept_link_refuses_when_no_auth_host_is_configured(monkeypatch) -> None:
    monkeypatch.setattr(settings, "FRONTEND_HOST", "")
    with pytest.raises(AppException) as refused:
        accept_link("abc")
    assert refused.value.status_code == 503


def test_sentry_event_cannot_carry_the_token() -> None:
    from src.telemetry import scrub_sentry_event

    token = "t" * 43
    event = {
        "exception": {
            "values": [
                {
                    "type": "ValueError",
                    "stacktrace": {"frames": [{"vars": {"token": token}}]},
                }
            ]
        },
        "request": {"data": token},
        "extra": {"token": token},
        "breadcrumbs": {"values": [{"message": token}]},
    }
    assert token not in json.dumps(scrub_sentry_event(event, {}))


async def test_listing_survives_a_deleted_inviter(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """The inviter reference is ON DELETE SET NULL: the list must still answer."""
    _, headers = await superuser_headers(db_async)
    created = (await invite(async_client, headers, "orphan@example.org")).json()
    row = await db_async.get(SuperuserInvitation, uuid.UUID(created["id"]))
    assert row is not None
    row.invited_by_user_id = None
    db_async.add(row)
    await db_async.commit()
    listed = await async_client.get(BASE, headers=headers)
    assert listed.status_code == 200
    assert listed.json()[0]["invited_by_user_id"] is None


async def test_placeholder_and_unverified_superusers_are_not_mailed(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """A superuser whose address cannot receive mail must not bounce the outbox."""
    inviter, headers = await superuser_headers(db_async)
    unverified = await make_user(db_async, superuser=True, verified=False)
    placeholder = await make_user(db_async, superuser=True)
    placeholder.email = "deleted-abc123@example.com"
    db_async.add(placeholder)
    await db_async.commit()
    await invite(async_client, headers, "quiet@example.org")
    recipients = {
        row.to_email
        for row in (
            await db_async.execute(
                select(OutboundEmail).where(OutboundEmail.template == "notification")
            )
        ).scalars()
    }
    assert inviter.email in recipients
    assert unverified.email not in recipients
    assert placeholder.email not in recipients


async def test_superuser_notice_footer_does_not_claim_preferences(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, headers = await superuser_headers(db_async)
    await invite(async_client, headers, "footer@example.org")
    rows = (
        (
            await db_async.execute(
                select(OutboundEmail).where(OutboundEmail.template == "notification")
            )
        )
        .scalars()
        .all()
    )
    assert rows
    for row in rows:
        footer = row.props["footer"]
        assert "choose which notifications" not in footer
        assert "not a preference-controlled email" in footer
