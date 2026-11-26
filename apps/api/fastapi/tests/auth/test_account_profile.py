"""The signed-in person's own profile: name and phone for the account app's checklist."""

from datetime import timedelta

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service
from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.schemas import AccountProfileUpdate
from src.auth.utils import create_access_token
from src.utils.datetime import utc_now
from tests.factories import make_user

URL = "/api/v1/auth/users/me/profile"


def _headers(user: User, *, app: str | None = None) -> dict[str, str]:
    token = create_access_token(user.id, timedelta(minutes=5), app=app)
    return {"Authorization": f"Bearer {token}"}


async def _account_app_headers(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    email: str,
) -> dict[str, str]:
    """Sign in to the account app through the single sign-on hand-off."""
    from src.auth.permissions import seed_permissions_and_roles_async
    from tests.auth.test_app_handoff import _account_session, _redeem, _start, _state

    await seed_permissions_and_roles_async(db_async)
    secret = "account-test-client-secret"
    monkeypatch.setattr(auth_settings, "ACCOUNT_SSO_CLIENT_SECRET", secret)
    base = "/api/v1/auth/apps/account"
    session_secret = await _account_session(db_async, email=email)
    state = _state()
    started = await _start(async_client, session_secret, state, join=True, base=base)
    assert started.status_code == 200, started.text
    redeemed = await _redeem(
        async_client, started.json()["code"], state, base=base, secret=secret
    )
    assert redeemed.status_code == 200, redeemed.text
    return {"Authorization": f"Bearer {redeemed.json()['access_token']}"}


@pytest.mark.parametrize(
    ("email", "first", "last", "expected"),
    [
        ("kezia@example.com", "kezia", "", True),
        ("Kezia@example.com", "KEZIA", " ", True),
        ("kezia@example.com", "", "Mitchell", True),
        ("kezia@example.com", "Kezia", "Mitchell", False),
        ("kezia@example.com", "kezia", "Mitchell", False),
        ("km@example.com", "Kezia", "", False),
    ],
)
def test_a_nameless_sign_up_counts_as_no_name(
    email: str, first: str, last: str, expected: bool
) -> None:
    user = User(email=email, first_name=first, last_name=last)
    assert service.name_is_placeholder(user) is expected


async def test_the_account_app_reads_and_saves_its_own_profile(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers = await _account_app_headers(
        async_client, db_async, monkeypatch, "profile-owner@example.com"
    )
    read = await async_client.get(URL, headers=headers)
    assert read.status_code == 200, read.text
    assert read.json() == {
        "email": "profile-owner@example.com",
        "first_name": "Staff",
        "last_name": "Member",
        "name_is_placeholder": False,
        "phone": None,
    }

    saved = await async_client.patch(
        URL,
        headers=headers,
        json={"first_name": "  Kezia ", "last_name": "St.  Louis"},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["first_name"] == "Kezia"
    assert saved.json()["last_name"] == "St. Louis"
    assert saved.json()["phone"] is None
    assert (await async_client.get(URL, headers=headers)).json() == saved.json()


async def test_a_nameless_sign_up_reads_as_a_placeholder_until_a_name_is_saved(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async, email="kezia@example.com")
    user.first_name, user.last_name = "kezia", ""
    await db_async.commit()
    headers = _headers(user)

    read = await async_client.get(URL, headers=headers)
    assert read.json()["name_is_placeholder"] is True
    saved = await async_client.patch(
        URL, headers=headers, json={"first_name": "Kezia", "last_name": "Mitchell"}
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["name_is_placeholder"] is False


@pytest.mark.parametrize(
    "body",
    [
        {"first_name": "", "last_name": "Mitchell"},
        {"first_name": "   ", "last_name": "Mitchell"},
        {"first_name": "Kezia", "last_name": None},
        {"first_name": "​", "last_name": "Mitchell"},
        {"first_name": "K" * 101, "last_name": "Mitchell"},
        {"phone": "440 1234"},
        {"phone": "+0 473 440 1234"},
        {"phone": "call me"},
    ],
)
async def test_a_bad_name_or_phone_is_refused_and_nothing_is_saved(
    async_client: httpx.AsyncClient, db_async: AsyncSession, body: dict[str, object]
) -> None:
    user = await make_user(db_async)
    before = (user.first_name, user.last_name, user.contact_phone)
    refused = await async_client.patch(URL, headers=_headers(user), json=body)
    assert refused.status_code == 422, refused.text
    await db_async.refresh(user)
    assert (user.first_name, user.last_name, user.contact_phone) == before


async def test_a_phone_is_saved_in_e164_and_blank_removes_it(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    headers = _headers(user)

    saved = await async_client.patch(
        URL, headers=headers, json={"phone": " +1 (473) 440-1234 "}
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["phone"] == "+14734401234"
    await db_async.refresh(user)
    assert user.contact_phone == "+14734401234"
    assert user.phone_e164 is None
    assert user.phone_verified_at is None

    # A name-only save leaves the number alone.
    named = await async_client.patch(
        URL, headers=headers, json={"first_name": "Kezia", "last_name": "Mitchell"}
    )
    assert named.json()["phone"] == "+14734401234"

    cleared = await async_client.patch(URL, headers=headers, json={"phone": "  "})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["phone"] is None
    await db_async.refresh(user)
    assert user.contact_phone is None


async def test_the_sign_in_number_is_never_read_or_written(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    user.phone_e164 = "+14734401234"
    verified_at = utc_now()
    user.phone_verified_at = verified_at
    await db_async.commit()
    headers = _headers(user)

    assert (await async_client.get(URL, headers=headers)).json()["phone"] is None
    saved = await async_client.patch(
        URL, headers=headers, json={"phone": "+14734405678"}
    )
    assert saved.status_code == 200, saved.text
    cleared = await async_client.patch(URL, headers=headers, json={"phone": None})
    assert cleared.status_code == 200, cleared.text
    await db_async.refresh(user)
    assert user.contact_phone is None
    assert user.phone_e164 == "+14734401234"
    assert user.phone_verified_at == verified_at


async def test_two_accounts_may_hold_the_same_contact_number(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """No conflict and nothing revealed: a number another account uses, as a contact
    number or as its sign-in number, is saved like any other."""
    holder = await make_user(db_async)
    holder.phone_e164 = "+14734401234"
    holder.contact_phone = "+14734401234"
    holder_name = (holder.first_name, holder.last_name)
    await db_async.commit()
    user = await make_user(db_async)

    saved = await async_client.patch(
        URL, headers=_headers(user), json={"phone": "+14734401234"}
    )
    assert saved.status_code == 200, saved.text
    await db_async.refresh(holder)
    await db_async.refresh(user)
    assert user.contact_phone == "+14734401234"
    assert user.phone_e164 is None
    assert holder.contact_phone == "+14734401234"
    assert holder.phone_e164 == "+14734401234"
    assert (holder.first_name, holder.last_name) == holder_name


async def test_only_the_named_fields_can_be_changed(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    email = user.email
    saved = await async_client.patch(
        URL,
        headers=_headers(user),
        json={
            "first_name": "Kezia",
            "last_name": "Mitchell",
            "email": "someone-else@example.com",
            "is_superuser": True,
            "phone_verified_at": "2026-01-01T00:00:00Z",
        },
    )
    assert saved.status_code == 200, saved.text
    await db_async.refresh(user)
    assert user.email == email
    assert user.is_superuser is False
    assert user.phone_verified_at is None


async def test_no_token_and_other_apps_tokens_are_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    assert (await async_client.get(URL)).status_code == 401
    assert (await async_client.patch(URL, json={"phone": ""})).status_code == 401
    events = _headers(user, app="events")
    assert (await async_client.get(URL, headers=events)).status_code == 401
    refused = await async_client.patch(
        URL, headers=events, json={"first_name": "Kezia", "last_name": "Mitchell"}
    )
    assert refused.status_code == 401
    await db_async.refresh(user)
    assert user.first_name != "Kezia"


async def test_the_service_keeps_fields_that_were_not_sent(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    first = user.first_name
    updated = await service.update_account_profile(
        session=db_async,
        user=user,
        profile_in=AccountProfileUpdate(last_name="Mitchell"),
    )
    assert (updated.first_name, updated.last_name) == (first, "Mitchell")
