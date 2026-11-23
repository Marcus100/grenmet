"""The Barrels account web app is registered for single sign-on (ADR-0017, ADR-0057)."""

import pytest

from src.auth import app_service, apps, service
from src.auth.config import auth_settings
from tests.auth.test_app_handoff import (
    _account_session,
    _redeem,
    _start,
    _state,
)


@pytest.fixture
async def seeded(monkeypatch, db_async):
    from src.auth.permissions import seed_permissions_and_roles_async

    await seed_permissions_and_roles_async(db_async)
    monkeypatch.setattr(app_service, "new_code", lambda: "123456")
    monkeypatch.setattr(app_service, "send_email", lambda **_: None)


BASE = "/api/v1/auth/apps/account"
SECRET = "account-test-client-secret"


def test_account_resolves_in_the_registry_as_a_self_service_site(monkeypatch):
    monkeypatch.setattr(auth_settings, "ACCOUNT_APP_URL", "https://account.barrels.gd/")
    app = apps.get_app("account")
    assert app is not None
    assert app.key == "account"
    assert app.label == "Barrels account"
    assert app.url == "https://account.barrels.gd"
    assert app.scope == "app"
    assert app.default_role == "account-member"
    assert app.access_permission == "app.account.access"
    assert app.self_signup is True
    assert app.callback_url == "https://account.barrels.gd/auth/callback"
    assert apps.is_app_scoped("account")


def test_account_defaults_to_the_local_port(monkeypatch):
    monkeypatch.setattr(auth_settings, "ACCOUNT_APP_URL", "http://localhost:3018")
    app = apps.get_app("account")
    assert app is not None
    assert app.url == "http://localhost:3018"


def test_account_sign_in_is_off_while_the_secret_is_empty(monkeypatch):
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", "")
    app = apps.get_app("account")
    assert app is not None
    assert not app.sso
    assert "account" not in {a.key for a in apps.registered_apps()}
    assert "account" in {a.key for a in apps.all_apps()}


def test_account_is_a_registered_permission_and_role():
    from src.auth.permissions import DEFAULT_ROLES, PERMISSIONS

    assert "app.account.access" in {p.key for p in PERMISSIONS}
    assert "account-member" in DEFAULT_ROLES
    assert "app.account.access" in DEFAULT_ROLES["account-member"][1]


@pytest.mark.asyncio
async def test_account_handoff_round_trip(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    _ = seeded
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", SECRET)
    secret = await _account_session(db_async)
    state = _state()
    joined = await _start(async_client, secret, state, join=True, base=BASE)
    assert joined.status_code == 200, joined.text
    assert joined.json()["callback_url"].endswith("/auth/callback")
    redeemed = await _redeem(
        async_client, joined.json()["code"], state, base=BASE, secret=SECRET
    )
    assert redeemed.status_code == 200, redeemed.text
    assert redeemed.json()["session"]["app_name"] == "account"


@pytest.mark.asyncio
async def test_account_handoff_refused_with_empty_secret(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    _ = seeded
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", "")
    secret = await _account_session(db_async)
    started = await _start(async_client, secret, _state(), join=True, base=BASE)
    assert started.status_code == 404
    redeemed = await _redeem(async_client, "x" * 32, _state(), base=BASE, secret=SECRET)
    assert redeemed.status_code == 404


async def _user_by_email(db_async, email):
    from sqlalchemy import select

    from src.auth.models import User

    return (
        await db_async.execute(select(User).where(User.email == email))
    ).scalar_one()


def test_only_the_account_app_skips_the_join_prompt():
    no_prompt = {app.key for app in apps.all_apps() if not app.join_prompt}
    assert no_prompt == {"account"}


@pytest.mark.asyncio
async def test_new_person_reaches_account_without_a_join_prompt(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    """A signed-in person with no account-app membership goes straight through."""
    _ = seeded
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", SECRET)
    email = "newcomer@example.com"
    secret = await _account_session(db_async, email=email)
    state = _state()

    started = await _start(async_client, secret, state, join=False, base=BASE)
    assert started.status_code == 200, started.text
    redeemed = await _redeem(
        async_client, started.json()["code"], state, base=BASE, secret=SECRET
    )
    assert redeemed.status_code == 200, redeemed.text
    assert redeemed.json()["session"]["app_name"] == "account"

    user = await _user_by_email(db_async, email)
    assert await service.is_eligible_for_app(
        session=db_async, user=user, app_key="account"
    )
    # Only the account app is granted; the other self-service apps stay closed.
    assert not await service.is_eligible_for_app(
        session=db_async, user=user, app_key="events"
    )
    assert not await service.is_eligible_for_app(
        session=db_async, user=user, app_key="bookings"
    )


@pytest.mark.asyncio
async def test_other_self_service_apps_still_ask_to_join(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    """Events keeps its Join prompt: the exception is for the account app only."""
    _ = seeded
    monkeypatch.setattr(auth_settings, "EVENTS_SSO_CLIENT_SECRET", SECRET)
    email = "eventsjoiner@example.com"
    secret = await _account_session(db_async, email=email)

    first = await _start(
        async_client, secret, _state(), join=False, base="/api/v1/auth/apps/events"
    )
    assert first.status_code == 409
    assert "Join" in first.text
    user = await _user_by_email(db_async, email)
    assert not await service.is_eligible_for_app(
        session=db_async, user=user, app_key="events"
    )


@pytest.mark.asyncio
async def test_staff_only_app_still_refuses_a_non_superuser(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    """superuser_only is unchanged: a plain person is refused by Barrels admin."""
    _ = seeded
    monkeypatch.setattr(auth_settings, "BARRELS_ADMIN_SSO_CLIENT_SECRET", SECRET)
    secret = await _account_session(db_async, email="plainperson@example.com")
    refused = await _start(
        async_client,
        secret,
        _state(),
        join=True,
        base="/api/v1/auth/apps/barrels-admin",
    )
    assert refused.status_code == 403
    assert "staff only" in refused.text


async def _account_handoff(async_client, secret, *, base=BASE):
    state = _state()
    started = await _start(async_client, secret, state, join=False, base=base)
    return started, state


async def _role_links(db_async, user) -> int:
    from sqlalchemy import func, select

    from src.auth.models import UserRoleLink

    return await db_async.scalar(
        select(func.count())
        .select_from(UserRoleLink)
        .where(UserRoleLink.user_id == user.id)
    )


async def _auto_grant_rows(db_async, user) -> list:
    from sqlalchemy import select

    from src.audit.models import AuditEntry

    return list(
        (
            await db_async.execute(
                select(AuditEntry).where(
                    AuditEntry.entity_id == str(user.id),
                    AuditEntry.action == "role_auto_grant",
                )
            )
        )
        .scalars()
        .all()
    )


@pytest.mark.asyncio
async def test_skipped_join_grant_is_audited_once_with_ids_only(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    _ = seeded
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", SECRET)
    email = "auditnewcomer@example.com"
    secret = await _account_session(db_async, email=email)
    user = await _user_by_email(db_async, email)

    started, state = await _account_handoff(async_client, secret)
    assert started.status_code == 200, started.text
    rows = await _auto_grant_rows(db_async, user)
    assert len(rows) == 1
    row = rows[0]
    assert row.entity_type == "account"
    assert row.record_type == "account_membership"
    assert row.actor_user_id == user.id
    assert len(row.action) <= 20
    fields = {change["field"]: change["new"] for change in row.changes}
    assert fields == {"app": "account", "role": "account-member"}
    assert email not in str(row.changes)

    # A later sign-in finds the link already there: no second row.
    again, _ = await _account_handoff(async_client, secret)
    assert again.status_code == 200, again.text
    assert len(await _auto_grant_rows(db_async, user)) == 1


@pytest.mark.asyncio
async def test_inactive_person_gets_no_account_role_through_the_skipped_prompt(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    _ = seeded
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", SECRET)
    email = "inactive@example.com"
    secret = await _account_session(db_async, email=email)
    user = await _user_by_email(db_async, email)
    user.is_active = False
    await db_async.commit()

    started, _ = await _account_handoff(async_client, secret)
    assert started.status_code == 401
    assert await _role_links(db_async, user) == 0
    assert await _auto_grant_rows(db_async, user) == []


@pytest.mark.asyncio
async def test_pending_password_setup_without_verified_email_gets_no_role(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    _ = seeded
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", SECRET)
    email = "pendingsetup@example.com"
    secret = await _account_session(db_async, email=email)
    user = await _user_by_email(db_async, email)
    user.password_setup_pending = True
    user.email_verified_at = None
    await db_async.commit()

    started, _ = await _account_handoff(async_client, secret)
    assert started.status_code == 403
    assert "can't sign in" in started.text
    assert await _role_links(db_async, user) == 0
    assert await _auto_grant_rows(db_async, user) == []
    assert not await service.is_eligible_for_app(
        session=db_async, user=user, app_key="account"
    )


@pytest.mark.asyncio
async def test_ended_employment_gets_no_account_role_through_the_skipped_prompt(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    from src.hr.models import Department, EmploymentRecord, EmploymentStatus

    _ = seeded
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", SECRET)
    email = "formerstaff@example.com"
    secret = await _account_session(db_async, email=email)
    user = await _user_by_email(db_async, email)
    if not await db_async.get(Department, "dept_account_test"):
        db_async.add(
            Department(
                organisation_id="gaa",
                code="dept_account_test",
                id="dept_account_test",
                name="Dept Account Test",
            )
        )
    db_async.add(
        EmploymentRecord(
            organisation_id="gaa",
            user_id=user.id,
            department_id="dept_account_test",
            employee_number="FORMER-ACCOUNT-1",
            position="Former officer",
            status=EmploymentStatus.TERMINATED,
        )
    )
    await db_async.commit()

    started, _ = await _account_handoff(async_client, secret)
    assert started.status_code == 403
    assert await _role_links(db_async, user) == 0
    assert await _auto_grant_rows(db_async, user) == []
    assert not await service.is_eligible_for_app(
        session=db_async, user=user, app_key="account"
    )


@pytest.mark.asyncio
async def test_account_sign_in_leaves_a_pending_staff_request_untouched(
    async_client,
    db_async,
    seeded,
    monkeypatch,
):
    from src.utils.datetime import utc_now

    _ = seeded
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", SECRET)
    email = "pendingstaff@example.com"
    secret = await _account_session(db_async, email=email)
    user = await _user_by_email(db_async, email)
    requested_at = utc_now().replace(microsecond=0)
    user.registration_pending = True
    user.staff_access_requested_at = requested_at
    await db_async.commit()

    started, _ = await _account_handoff(async_client, secret)
    assert started.status_code == 200, started.text
    await db_async.refresh(user)
    assert user.registration_pending is True
    assert user.staff_access_requested_at.replace(microsecond=0) == requested_at
    # Still not staff: the request is waiting, and the account app does not decide it.
    assert not service.is_staff_eligible(user)
