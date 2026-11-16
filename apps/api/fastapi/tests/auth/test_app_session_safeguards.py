"""ADR-0061 sign-in safeguards for app-scoped sessions.

Three per-app settings on ``AppDefinition``, all off by default:

* ``max_session_hours``: a session lasts at most this long from the original sign-in,
  and refreshing never extends it;
* ``require_authenticator``: sign-in refuses a person with no enrolled authenticator;
* ``privileged_members``: holders of the app's access follow the privileged enrolment
  rules (emailed code, ending other sessions) without becoming privileged for sign-in.

Events is the app under test. Each test that needs a setting swaps the events
definition for a ``dataclasses.replace`` copy, so the real registry is not changed.
"""

import dataclasses
from datetime import timedelta

import pyotp
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select

from src.auth import (
    app_service,
    apps,
    privileged_mfa,
    service,
    sessions,
    totp,
    totp_enrolment,
)
from src.auth.config import auth_settings
from src.auth.models import Role, User, UserRoleLink
from src.auth.models import Session as LoginSession
from src.auth.permissions import seed_permissions_and_roles_async
from src.exceptions import AppException
from src.utils.datetime import utc_now
from tests.factories import make_user

BASE = "/api/v1/auth/apps/events"
REFRESH = "/api/v1/auth/sessions/refresh"
CODE = "424242"
CAP_HOURS = 12
SIGN_IN_REFUSAL = "authenticator_required"


@pytest.fixture(autouse=True)
def fixed_code(monkeypatch):
    monkeypatch.setattr(app_service, "new_code", lambda: CODE)
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


@pytest.fixture
async def roles(db_async):
    await seed_permissions_and_roles_async(db_async)


@pytest.fixture
def events_app(monkeypatch):
    """Override the events definition for one test, through a test-only copy."""
    original = apps._apps

    def override(**changes):
        def patched():
            registry = original()
            registry["events"] = dataclasses.replace(registry["events"], **changes)
            return registry

        monkeypatch.setattr(apps, "_apps", patched)

    return override


@pytest.fixture
def clock(monkeypatch):
    """Session times read from one settable clock, starting at the real time now."""
    now = {"at": utc_now()}
    monkeypatch.setattr(sessions, "utc_now", lambda: now["at"])
    return now


def advance(clock, **delta) -> None:
    clock["at"] = clock["at"] + timedelta(**delta)


async def code_sign_in(client, email: str, totp_code: str | None = None):
    await client.post(f"{BASE}/email-code/start", json={"email": email})
    body: dict[str, str] = {"email": email, "code": CODE}
    if totp_code is not None:
        body["totp_code"] = totp_code
    return await client.post(f"{BASE}/email-code/verify", json=body)


async def password_sign_in(client, email: str, password: str = "password123"):
    return await client.post(
        f"{BASE}/login", json={"email": email, "password": password}
    )


async def enrol_authenticator(db, user) -> str:
    """Give a user an enrolled authenticator directly, and return its secret."""
    secret = totp.generate_secret()
    user.totp_secret = totp.encrypt_secret(secret)
    user.totp_enabled = True
    db.add(user)
    await db.commit()
    return secret


async def grant_events_access(db, user) -> None:
    role_id = await db.scalar(select(Role.id).where(Role.name == "events-member"))
    db.add(UserRoleLink(user_id=user.id, role_id=role_id))
    await db.commit()


async def stored(db, token: str) -> LoginSession:
    row = await service.get_session_by_secret(session=db, session_secret=token)
    assert row is not None
    await db.refresh(row)
    return row


# --- Session cap (max_session_hours) -----------------------------------------------


@pytest.mark.usefixtures("roles")
async def test_capped_session_expires_at_the_cap_from_sign_in(
    async_client, db_async, events_app, clock
):
    events_app(max_session_hours=CAP_HOURS)
    user = await make_user(db_async)
    signed_in = clock["at"]

    response = await code_sign_in(async_client, user.email)
    assert response.status_code == 200, response.text
    row = await stored(db_async, response.json()["session_token"])

    assert row.signed_in_at == signed_in
    assert row.expires_at == signed_in + timedelta(hours=CAP_HOURS)


@pytest.mark.usefixtures("roles")
async def test_refresh_never_extends_a_capped_session_past_its_cap(
    async_client, db_async, events_app, clock
):
    events_app(max_session_hours=CAP_HOURS)
    user = await make_user(db_async)
    signed_in = clock["at"]
    token = (await code_sign_in(async_client, user.email)).json()["session_token"]

    advance(clock, hours=11)
    refreshed = await async_client.post(REFRESH, json={"session_token": token})
    assert refreshed.status_code == 200, refreshed.text
    token = refreshed.json()["session_token"]
    row = await stored(db_async, token)
    assert row.expires_at == signed_in + timedelta(hours=CAP_HOURS)

    advance(clock, minutes=30)
    refreshed = await async_client.post(REFRESH, json={"session_token": token})
    assert refreshed.status_code == 200, refreshed.text
    row = await stored(db_async, refreshed.json()["session_token"])
    assert row.expires_at == signed_in + timedelta(hours=CAP_HOURS)

    # At the cap the session is over: refresh refuses, revokes it, and the
    # access-token exchange gives no token from it any more.
    advance(clock, minutes=30)
    last = refreshed.json()["session_token"]
    expired = await async_client.post(REFRESH, json={"session_token": last})
    assert expired.status_code == 401
    assert (await stored(db_async, last)).revoked_at is not None
    exchanged = await async_client.post(
        "/api/v1/auth/sessions/access-token", json={"session_token": last}
    )
    assert exchanged.status_code == 401


@pytest.mark.usefixtures("roles")
async def test_a_legacy_session_past_its_cap_is_revoked_on_refresh(
    async_client, db_async, events_app, clock
):
    """A row created before the cap still has its old expiry; refresh must refuse it
    and revoke it rather than rotate it."""
    user = await make_user(db_async)
    token = (await code_sign_in(async_client, user.email)).json()["session_token"]
    row = await stored(db_async, token)
    row.signed_in_at = clock["at"] - timedelta(hours=CAP_HOURS + 1)
    await db_async.commit()
    events_app(max_session_hours=CAP_HOURS)

    refused = await async_client.post(REFRESH, json={"session_token": token})

    assert refused.status_code == 401
    assert (await stored(db_async, token)).revoked_at is not None
    exchanged = await async_client.post(
        "/api/v1/auth/sessions/access-token", json={"session_token": token}
    )
    assert exchanged.status_code == 401


@pytest.mark.usefixtures("roles")
async def test_the_original_sign_in_survives_several_rotations(
    async_client, db_async, events_app, clock
):
    events_app(max_session_hours=CAP_HOURS)
    user = await make_user(db_async)
    signed_in = clock["at"]
    token = (await code_sign_in(async_client, user.email)).json()["session_token"]

    for hours in (1, 2, 3):
        advance(clock, hours=1)
        refreshed = await async_client.post(REFRESH, json={"session_token": token})
        assert refreshed.status_code == 200, refreshed.text
        token = refreshed.json()["session_token"]
        row = await stored(db_async, token)
        assert row.signed_in_at == signed_in, f"rotation {hours} lost the sign-in"
        assert row.expires_at == signed_in + timedelta(hours=CAP_HOURS)


@pytest.mark.usefixtures("roles")
async def test_password_sign_in_also_sets_the_original_sign_in_and_cap(
    async_client, db_async, events_app, clock
):
    events_app(max_session_hours=CAP_HOURS)
    user = await make_user(db_async)
    signed_in = clock["at"]

    response = await password_sign_in(async_client, user.email)
    assert response.status_code == 200, response.text
    row = await stored(db_async, response.json()["session_token"])
    assert row.signed_in_at == signed_in
    assert row.expires_at == signed_in + timedelta(hours=CAP_HOURS)


@pytest.mark.usefixtures("roles")
async def test_a_session_without_signed_in_at_falls_back_to_created_at(
    async_client, db_async, events_app, clock
):
    """Rows from before the column are NULL; the refresh reads created_at instead."""
    events_app(max_session_hours=CAP_HOURS)
    user = await make_user(db_async)
    token = (await code_sign_in(async_client, user.email)).json()["session_token"]
    old = await stored(db_async, token)
    created = clock["at"]
    old.signed_in_at = None
    old.created_at = created
    await db_async.commit()

    advance(clock, hours=11)
    refreshed = await async_client.post(REFRESH, json={"session_token": token})
    assert refreshed.status_code == 200, refreshed.text
    row = await stored(db_async, refreshed.json()["session_token"])
    assert row.signed_in_at == created
    assert row.expires_at == created + timedelta(hours=CAP_HOURS)


@pytest.mark.usefixtures("roles")
async def test_uncapped_app_keeps_the_thirty_day_expiry_and_refresh(
    async_client, db_async, clock
):
    user = await make_user(db_async)
    signed_in = clock["at"]
    token = (await code_sign_in(async_client, user.email)).json()["session_token"]
    row = await stored(db_async, token)
    assert row.expires_at == signed_in + timedelta(
        days=auth_settings.SESSION_EXPIRE_DAYS
    )

    advance(clock, days=1)
    refreshed = await async_client.post(REFRESH, json={"session_token": token})
    assert refreshed.status_code == 200, refreshed.text
    row = await stored(db_async, refreshed.json()["session_token"])
    assert row.expires_at == clock["at"] + timedelta(
        days=auth_settings.SESSION_EXPIRE_DAYS
    )


# --- Authenticator required at sign-in (require_authenticator) ----------------------


@pytest.mark.usefixtures("roles")
async def test_refuses_a_person_without_an_authenticator_and_creates_no_session(
    async_client, db_async, events_app
):
    events_app(require_authenticator=True)
    user = await make_user(db_async)

    response = await code_sign_in(async_client, user.email)

    assert response.status_code == 403
    detail = response.json()["detail"]
    assert "account.barrels.gd" in detail
    assert "(" not in detail  # the code lives in the body, not in the sentence
    assert response.json()["code"] == SIGN_IN_REFUSAL
    rows = (
        await db_async.scalars(
            select(LoginSession).where(LoginSession.user_id == user.id)
        )
    ).all()
    assert rows == []


@pytest.mark.usefixtures("roles")
async def test_unknown_address_gets_the_same_refusal_as_a_known_one(
    async_client, db_async, events_app
):
    """A correct code proves the mailbox, so the refusal reveals nothing new."""
    events_app(require_authenticator=True)
    known = await make_user(db_async)
    known_reply = await code_sign_in(async_client, known.email)
    new_reply = await code_sign_in(async_client, "newcomer-authenticator@example.com")

    assert known_reply.status_code == new_reply.status_code == 403
    assert known_reply.json()["detail"] == new_reply.json()["detail"]


@pytest.mark.usefixtures("roles")
async def test_password_sign_in_refused_without_an_authenticator_and_no_session(
    async_client, db_async, events_app
):
    events_app(require_authenticator=True)
    user = await make_user(db_async)

    refused = await password_sign_in(async_client, user.email)
    assert refused.status_code == 403
    assert refused.json()["code"] == SIGN_IN_REFUSAL
    rows = (
        await db_async.scalars(
            select(LoginSession).where(LoginSession.user_id == user.id)
        )
    ).all()
    assert rows == []


@pytest.mark.usefixtures("roles")
async def test_wrong_password_still_gets_the_generic_answer(
    async_client, db_async, events_app
):
    """The refusal comes only after the password is right, so a guess learns nothing."""
    events_app(require_authenticator=True)
    user = await make_user(db_async)

    wrong = await password_sign_in(
        async_client, user.email, password="not-the-password"
    )
    assert wrong.status_code == 400
    assert "Incorrect email or password" in wrong.json()["detail"]


@pytest.mark.usefixtures("roles")
async def test_person_with_an_authenticator_signs_in_with_mfa_stamped(
    async_client, db_async, events_app
):
    events_app(require_authenticator=True)
    user = await make_user(db_async)
    secret = await enrol_authenticator(db_async, user)

    response = await code_sign_in(
        async_client, user.email, totp_code=pyotp.TOTP(secret).now()
    )

    assert response.status_code == 200, response.text
    row = await stored(db_async, response.json()["session_token"])
    assert row.mfa_verified_at is not None


@pytest.mark.usefixtures("roles")
async def test_password_sign_in_with_an_authenticator_stamps_mfa(
    async_client, db_async, events_app
):
    events_app(require_authenticator=True)
    user = await make_user(db_async)
    secret = await enrol_authenticator(db_async, user)
    response = await async_client.post(
        f"{BASE}/login",
        json={
            "email": user.email,
            "password": "password123",
            "totp_code": pyotp.TOTP(secret).now(),
        },
    )
    assert response.status_code == 200, response.text
    row = await stored(db_async, response.json()["session_token"])
    assert row.mfa_verified_at is not None


@pytest.mark.usefixtures("roles")
async def test_default_off_app_signs_in_without_an_authenticator(
    async_client, db_async
):
    user = await make_user(db_async)

    response = await code_sign_in(async_client, user.email)

    assert response.status_code == 200, response.text
    row = await stored(db_async, response.json()["session_token"])
    assert row.mfa_verified_at is None


def test_every_registered_app_defaults_to_the_unchanged_behaviour():
    """No app opts in by default: no cap, no required authenticator, no enrolment rule."""
    for app in apps.all_apps():
        assert app.max_session_hours is None, app.key
        assert app.require_authenticator is False, app.key
        assert app.privileged_members is False, app.key


# --- Privileged enrolment for holders of an app (privileged_members) ----------------


async def _capture_enrolment_codes(monkeypatch) -> list[str]:
    sent: list[str] = []

    async def capture(**kwargs: str) -> None:
        sent.append(kwargs["code"])

    monkeypatch.setattr(totp_enrolment, "_send_enrolment_code", capture)
    return sent


@pytest.mark.usefixtures("roles")
async def test_holder_of_an_app_with_privileged_members_needs_an_emailed_code(
    db_async, events_app, monkeypatch
):
    events_app(privileged_members=True)
    sent = await _capture_enrolment_codes(monkeypatch)
    user = await make_user(db_async)
    await grant_events_access(db_async, user)

    # The sign-in rule is unchanged: a holder is not privileged for sign-in.
    assert await privileged_mfa.is_privileged(db_async, user) is False
    assert await privileged_mfa.is_enrolment_privileged(db_async, user) is True

    secret = await service.begin_totp_setup(session=db_async, user=user)
    assert len(sent) == 1
    with pytest.raises(AppException, match="emailed you"):
        await service.activate_totp(
            session=db_async, user=user, code=pyotp.TOTP(secret).now()
        )
    assert await service.activate_totp(
        session=db_async,
        user=user,
        code=pyotp.TOTP(secret).now(),
        email_code=sent[0],
    )


@pytest.mark.usefixtures("roles")
async def test_enrolment_ends_the_other_sessions_of_a_holder(
    db_async, events_app, monkeypatch
):
    events_app(privileged_members=True)
    sent = await _capture_enrolment_codes(monkeypatch)
    user = await make_user(db_async)
    await grant_events_access(db_async, user)
    first, _ = await service.create_session(
        session=db_async, user=user, app_name="events"
    )
    second, _ = await service.create_session(
        session=db_async, user=user, app_name="events"
    )

    secret = await service.begin_totp_setup(session=db_async, user=user)
    assert await service.activate_totp(
        session=db_async,
        user=user,
        code=pyotp.TOTP(secret).now(),
        email_code=sent[0],
    )

    for row in (first, second):
        await db_async.refresh(row)
        assert row.revoked_at is not None


@pytest.mark.usefixtures("roles")
async def test_holder_cannot_change_email_until_two_step_is_on(db_async, events_app):
    events_app(privileged_members=True)
    user = await make_user(db_async)
    await grant_events_access(db_async, user)

    with pytest.raises(AppException, match="email_change_blocked"):
        await totp_enrolment.ensure_email_change_allowed(session=db_async, user=user)


@pytest.mark.usefixtures("roles")
async def test_app_with_privileged_members_off_is_unchanged(db_async, monkeypatch):
    sent = await _capture_enrolment_codes(monkeypatch)
    user = await make_user(db_async)
    await grant_events_access(db_async, user)
    other, _ = await service.create_session(
        session=db_async, user=user, app_name="events"
    )

    assert await privileged_mfa.is_enrolment_privileged(db_async, user) is False
    secret = await service.begin_totp_setup(session=db_async, user=user)
    assert sent == []
    assert await service.activate_totp(
        session=db_async, user=user, code=pyotp.TOTP(secret).now()
    )
    await db_async.refresh(other)
    assert other.revoked_at is None
    await totp_enrolment.ensure_email_change_allowed(session=db_async, user=user)


# --- Review fixes: per-request checks, handoff, refusal order ----------------------

SSO_SECRET = "handoff-test-secret"
STATE = "state-for-the-handoff-tests-0123456789"


async def account_session(db, user, *, signed_in_at=None, mfa_verified_at=None) -> str:
    """An auth.barrels.gd account session, the source of a handoff."""
    _, secret = await service.create_session(
        session=db,
        user=user,
        app_name="auth",
        signed_in_at=signed_in_at,
        mfa_verified_at=mfa_verified_at,
    )
    return secret


async def handoff_code(async_client, secret: str) -> str:
    response = await async_client.post(
        f"{BASE}/handoff",
        json={"session_token": secret, "state": STATE, "join": True},
    )
    assert response.status_code == 200, response.text
    return response.json()["code"]


async def redeem(async_client, code: str):
    return await async_client.post(
        f"{BASE}/handoff/redeem",
        json={"code": code, "state": STATE, "client_secret": SSO_SECRET},
    )


@pytest.mark.usefixtures("roles")
async def test_disabling_the_authenticator_refuses_refresh_and_app_routes(
    async_client, db_async, events_app
):
    events_app(require_authenticator=True)
    user = await make_user(db_async)
    secret = await enrol_authenticator(db_async, user)
    signed = await code_sign_in(
        async_client, user.email, totp_code=pyotp.TOTP(secret).now()
    )
    assert signed.status_code == 200, signed.text
    token = signed.json()["session_token"]
    access = signed.json()["access_token"]

    await service.disable_totp(session=db_async, user=user)

    route = await async_client.get(
        f"{BASE}/me", headers={"Authorization": f"Bearer {access}"}
    )
    assert route.status_code == 403
    assert route.json()["code"] == SIGN_IN_REFUSAL
    refused = await async_client.post(REFRESH, json={"session_token": token})
    assert refused.status_code == 401
    assert (await stored(db_async, token)).revoked_at is not None
    exchanged = await async_client.post(
        "/api/v1/auth/sessions/access-token", json={"session_token": token}
    )
    assert exchanged.status_code == 401


@pytest.mark.usefixtures("roles")
async def test_a_refused_refresh_leaves_other_apps_alone(
    async_client, db_async, events_app
):
    """Only the refused app's session is revoked; the person's account session stays."""
    events_app(require_authenticator=True)
    user = await make_user(db_async)
    secret = await enrol_authenticator(db_async, user)
    account = await account_session(db_async, user, mfa_verified_at=utc_now())
    signed = await code_sign_in(
        async_client, user.email, totp_code=pyotp.TOTP(secret).now()
    )
    await service.disable_totp(session=db_async, user=user)

    await async_client.post(
        REFRESH, json={"session_token": signed.json()["session_token"]}
    )

    assert await service.get_active_session_by_secret(
        session=db_async, session_secret=account
    )


@pytest.mark.usefixtures("roles")
async def test_handoff_counts_the_cap_from_the_original_sign_in(
    async_client, db_async, events_app, clock
):
    events_app(max_session_hours=CAP_HOURS, client_secret=SSO_SECRET)
    user = await make_user(db_async)
    original = clock["at"] - timedelta(hours=10)
    secret = await account_session(
        db_async, user, signed_in_at=original, mfa_verified_at=clock["at"]
    )

    redeemed = await redeem(async_client, await handoff_code(async_client, secret))

    assert redeemed.status_code == 200, redeemed.text
    row = await stored(db_async, redeemed.json()["session_token"])
    assert row.signed_in_at == original
    assert row.expires_at == original + timedelta(hours=CAP_HOURS)


@pytest.mark.usefixtures("roles")
async def test_handoff_refuses_a_capped_account_session_already_past_the_cap(
    async_client, db_async, events_app, clock
):
    events_app(max_session_hours=CAP_HOURS, client_secret=SSO_SECRET)
    user = await make_user(db_async)
    secret = await account_session(
        db_async,
        user,
        signed_in_at=clock["at"] - timedelta(hours=CAP_HOURS + 1),
        mfa_verified_at=clock["at"],
    )

    refused = await redeem(async_client, await handoff_code(async_client, secret))

    assert refused.status_code == 401


@pytest.mark.usefixtures("roles")
async def test_handoff_into_a_requiring_app_needs_an_authenticator_checked_at_sign_in(
    async_client, db_async, events_app
):
    events_app(require_authenticator=True, client_secret=SSO_SECRET)
    user = await make_user(db_async)
    await enrol_authenticator(db_async, user)
    unverified = await account_session(db_async, user)

    refused = await redeem(async_client, await handoff_code(async_client, unverified))

    assert refused.status_code == 403
    assert refused.json()["code"] == SIGN_IN_REFUSAL
    assert "Sign in to account.barrels.gd" in refused.json()["detail"]
    assert (
        await db_async.scalars(
            select(LoginSession).where(
                LoginSession.user_id == user.id, LoginSession.app_name == "events"
            )
        )
    ).all() == []

    verified = await account_session(db_async, user, mfa_verified_at=utc_now())
    ok = await redeem(async_client, await handoff_code(async_client, verified))
    assert ok.status_code == 200, ok.text


@pytest.mark.usefixtures("roles")
async def test_a_new_address_is_refused_before_an_account_exists_and_the_code_is_kept(
    async_client, db_async, events_app
):
    events_app(require_authenticator=True)
    email = "new-authenticator-check@example.com"
    await async_client.post(f"{BASE}/email-code/start", json={"email": email})

    first = await async_client.post(
        f"{BASE}/email-code/verify", json={"email": email, "code": CODE}
    )

    assert first.status_code == 403
    assert first.json()["code"] == SIGN_IN_REFUSAL
    assert first.json()["detail"] == (
        "Add an authenticator on account.barrels.gd to sign in to Barrels Events."
    )
    assert await db_async.scalar(select(User.id).where(User.email == email)) is None
    # The code was not spent, so a second try gets the same refusal, not "wrong code".
    again = await async_client.post(
        f"{BASE}/email-code/verify", json={"email": email, "code": CODE}
    )
    assert again.status_code == 403
