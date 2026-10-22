"""Barrels staff operate any organiser's events (ADR-0050).

Staff hold global ``events.ops.*`` keys through roles; a superuser has none
implicitly. The staff path is only ``require_org_permission_or_staff`` on the
Events org-zone routes. Money, MFA, suspension, entitlement, expiry, capacity in
history, e-mail visibility and rate limits are covered here."""

import uuid
from datetime import timedelta

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service, totp
from src.auth.config import auth_settings
from src.auth.models import (
    Role,
    RoleAssignmentScope,
    User,
    UserRoleAssignment,
    UserRoleLink,
)
from src.auth.permissions import seed_permissions_and_roles_async
from src.auth.utils import create_access_token
from src.events import org_router
from src.events.models import Activity
from src.organisations.models import OrganisationApp, PlatformOrganisation
from src.rate_limit import limiter
from src.utils.datetime import utc_now
from tests.events.support import SessionFactory
from tests.events.test_org_orders import (
    ORG,
    _activity,
    _desk,
    _paid,
    _pending,
    _shop_with_events,
)
from tests.events.test_org_permissions import ROUTES, Route
from tests.events.test_paid_orders import Shop
from tests.factories import make_user as make_full_user

ADMIN = "/api/v1/events/admin"

STAFF_ROLE = {
    "list-orders": "events-staff-manager",
    "get-order": "events-staff-manager",
    "list-attendees": "events-staff-door",
    "manual-payment": "events-staff-till",
    "refund-order": "events-staff-refunds",
    "cancel-order": "events-staff-refunds",
    "cancel-event": "events-staff-manager",
}
WRONG_ROLE = {
    "list-attendees": "events-staff-till",
    **{name: "events-staff-door" for name in STAFF_ROLE if name != "list-attendees"},
}
NO_MFA_ROUTES = {"list-attendees"}


@pytest.fixture(autouse=True)
def _totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )
    # The staff path must not depend on the staged privileged-MFA mode.
    monkeypatch.setattr(auth_settings, "AUTH_PRIVILEGED_MFA_MODE", "disabled")


async def _give_role(
    db: AsyncSession,
    user_id: uuid.UUID,
    role_name: str,
    *,
    how: str = "link",
    effective_to: object = None,
) -> None:
    await seed_permissions_and_roles_async(db)
    role = await db.scalar(select(Role).where(Role.name == role_name))
    assert role is not None, role_name
    if how == "link":
        db.add(UserRoleLink(user_id=user_id, role_id=role.id))
    else:
        db.add(
            UserRoleAssignment(
                organisation_id="gaa",
                user_id=user_id,
                role_id=role.id,
                scope=RoleAssignmentScope.ALL,
                effective_from=utc_now() - timedelta(days=1),
                effective_to=effective_to,
            )
        )
    await db.commit()


async def _staff(
    db: AsyncSession,
    role_name: str | None,
    *,
    mfa: bool = True,
    app: str | None = None,
    superuser: bool = False,
    how: str = "link",
    effective_to: object = None,
) -> tuple[User, dict[str, str]]:
    """A staff user with ``role_name`` and a bearer token; ``mfa`` signs in with an
    enrolled authenticator, ``app`` mints an app-scoped token (``events``)."""
    user = await make_full_user(db, superuser=superuser)
    if role_name is not None:
        await _give_role(db, user.id, role_name, how=how, effective_to=effective_to)
    if not mfa:
        token = create_access_token(
            user.id, expires_delta=timedelta(minutes=5), app=app
        )
        return user, {"Authorization": f"Bearer {token}"}
    row = await db.get(User, user.id)
    assert row is not None
    row.totp_secret = totp.encrypt_secret(totp.generate_secret())
    row.totp_enabled = True
    await db.commit()
    stored, _ = await service.create_session(
        session=db,
        user=row,
        app_name=app,
        enforce_approval=False,
        mfa_verified_at=utc_now(),
    )
    token, _ = service.issue_access_token_for_user(
        user=row, expires_delta=timedelta(minutes=5), app=app, db_session=stored
    )
    return user, {"Authorization": f"Bearer {token}"}


def _with_org(headers: dict[str, str], shop: Shop) -> dict[str, str]:
    return {**headers, "X-Barrels-Organisation": shop.organisation_id}


async def _call(
    route: Route, headers: dict[str, str], order_id: str, shop: Shop
) -> httpx.Response:
    async with await _desk() as client:
        return await route.call(client, _with_org(headers, shop), order_id, shop)


def _route(name: str) -> Route:
    return next(r for r in ROUTES if r.name == name)


async def _prepare(
    db: AsyncSession, events_db: SessionFactory, route: Route
) -> tuple[Shop, str]:
    shop = await _shop_with_events(db, events_db, allocation=10)
    order_id = (
        await _paid(db, shop) if route.needs_paid else (await _pending(db, shop))[0]
    )
    return shop, order_id


# --- allowed / wrong key / no role / superuser ---------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("name", list(STAFF_ROLE))
async def test_staff_key_opens_its_route_and_other_keys_do_not(
    name: str, db_async: AsyncSession, events_db: SessionFactory
) -> None:
    route = _route(name)
    shop, order_id = await _prepare(db_async, events_db, route)
    _, right = await _staff(db_async, STAFF_ROLE[name])
    _, wrong = await _staff(db_async, WRONG_ROLE[name])
    _, nobody = await _staff(db_async, None)
    assert (await _call(route, wrong, order_id, shop)).status_code == 404
    assert (await _call(route, nobody, order_id, shop)).status_code == 404
    allowed = await _call(route, right, order_id, shop)
    assert allowed.status_code == route.ok, allowed.text


@pytest.mark.asyncio
@pytest.mark.parametrize("name", list(STAFF_ROLE))
async def test_a_superuser_without_the_role_has_no_staff_keys(
    name: str, db_async: AsyncSession, events_db: SessionFactory
) -> None:
    route = _route(name)
    shop, order_id = await _prepare(db_async, events_db, route)
    _, root = await _staff(db_async, None, superuser=True)
    assert (await _call(route, root, order_id, shop)).status_code == 404


@pytest.mark.asyncio
async def test_staff_are_not_members_and_other_apps_tokens_are_refused(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    user, _ = await _staff(db_async, "events-staff-manager")
    token = create_access_token(
        user.id, expires_delta=timedelta(minutes=5), app="bookings"
    )
    async with await _desk() as client:
        response = await client.get(
            f"{ORG}/events/{shop.listing_id}/orders",
            headers=_with_org({"Authorization": f"Bearer {token}"}, shop),
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_events_app_token_and_account_token_both_work_with_mfa(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    url = f"{ORG}/events/{shop.listing_id}/orders"
    _, account = await _staff(db_async, "events-staff-manager", app=None)
    _, app_token = await _staff(db_async, "events-staff-manager", app="events")
    _, app_no_mfa = await _staff(
        db_async, "events-staff-manager", app="events", mfa=False
    )
    async with await _desk() as client:
        for headers in (account, app_token):
            response = await client.get(url, headers=_with_org(headers, shop))
            assert response.status_code == 200, response.text
        denied = await client.get(url, headers=_with_org(app_no_mfa, shop))
    assert denied.status_code == 403


@pytest.mark.asyncio
async def test_an_app_session_cannot_pass_as_an_account_session_for_mfa(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    """An account token whose sid is an Events app session does not satisfy MFA."""
    shop = await _shop_with_events(db_async, events_db)
    user, _ = await _staff(db_async, "events-staff-manager")
    row = await db_async.get(User, user.id)
    assert row is not None
    stored, _ = await service.create_session(
        session=db_async,
        user=row,
        app_name="events",
        enforce_approval=False,
        mfa_verified_at=utc_now(),
    )
    token = create_access_token(
        user.id, expires_delta=timedelta(minutes=5), session_id=str(stored.id)
    )
    async with await _desk() as client:
        response = await client.get(
            f"{ORG}/events/{shop.listing_id}/orders",
            headers=_with_org({"Authorization": f"Bearer {token}"}, shop),
        )
    assert response.status_code == 403


# --- MFA -----------------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("name", list(STAFF_ROLE))
async def test_mfa_is_required_except_for_the_door(
    name: str, db_async: AsyncSession, events_db: SessionFactory
) -> None:
    route = _route(name)
    shop, order_id = await _prepare(db_async, events_db, route)
    _, headers = await _staff(db_async, STAFF_ROLE[name], mfa=False)
    response = await _call(route, headers, order_id, shop)
    if name in NO_MFA_ROUTES:
        assert response.status_code == route.ok, response.text
    else:
        assert response.status_code == 403, response.text


# --- organisation state --------------------------------------------------------------


@pytest.mark.asyncio
async def test_suspended_entitlement_off_and_unknown_organisation(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    _, headers = await _staff(db_async, "events-staff-manager")
    url = f"{ORG}/events/{shop.listing_id}/orders"
    async with await _desk() as client:
        ok = await client.get(url, headers=_with_org(headers, shop))
        unknown = await client.get(
            url, headers={**headers, "X-Barrels-Organisation": "org_nope"}
        )
        await db_async.execute(
            update(OrganisationApp)
            .where(
                OrganisationApp.organisation_id == shop.organisation_id,
                OrganisationApp.app_key == "events",
            )
            .values(enabled=False)
        )
        await db_async.commit()
        off = await client.get(url, headers=_with_org(headers, shop))
        await db_async.execute(
            update(OrganisationApp)
            .where(OrganisationApp.organisation_id == shop.organisation_id)
            .values(enabled=True)
        )
        await db_async.execute(
            update(PlatformOrganisation)
            .where(PlatformOrganisation.id == shop.organisation_id)
            .values(status="suspended")
        )
        await db_async.commit()
        suspended = await client.get(url, headers=_with_org(headers, shop))
    assert (ok.status_code, unknown.status_code) == (200, 404)
    assert (off.status_code, suspended.status_code) == (403, 403)


@pytest.mark.asyncio
async def test_the_listing_must_belong_to_the_named_organisation(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    mine = await _shop_with_events(db_async, events_db)
    other = await _shop_with_events(db_async, events_db)
    _, headers = await _staff(db_async, "events-staff-manager")
    async with await _desk() as client:
        response = await client.get(
            f"{ORG}/events/{other.listing_id}/orders", headers=_with_org(headers, mine)
        )
    assert response.status_code == 404


# --- member path unchanged -----------------------------------------------------------


@pytest.mark.asyncio
async def test_member_path_is_unchanged_and_records_member_capacity(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    from tests.organisations.support import headers_for

    owner = headers_for(shop.owner, shop.organisation_id)
    async with await _desk() as client:
        response = await client.post(
            f"{ORG}/orders/{order_id}/cancel", headers=owner, json={"refund": "none"}
        )
    assert response.status_code == 200, response.text
    rows = await _activity(events_db, "order.cancelled")
    assert [r.actor_capacity for r in rows] == ["member"]


@pytest.mark.asyncio
async def test_a_staff_member_who_is_also_a_member_without_the_key_uses_staff_path(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    """Member path first; a member lacking the key falls through to the staff path,
    and a plain member without a staff key keeps the member 403."""
    from tests.events.test_org_permissions import _member
    from tests.organisations.support import headers_for

    shop = await _shop_with_events(db_async, events_db)
    plain = await _member(db_async, shop, None)
    async with await _desk() as client:
        denied = await client.get(
            f"{ORG}/events/{shop.listing_id}/orders",
            headers=headers_for(plain, shop.organisation_id),
        )
    assert denied.status_code == 403


# --- activity capacity ---------------------------------------------------------------


@pytest.mark.asyncio
async def test_staff_writes_record_staff_capacity(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    user, headers = await _staff(db_async, "events-staff-refunds")
    async with await _desk() as client:
        response = await client.post(
            f"{ORG}/orders/{order_id}/cancel",
            headers=_with_org(headers, shop),
            json={"refund": "none"},
        )
    assert response.status_code == 200, response.text
    rows = await _activity(events_db, "order.cancelled")
    assert [(r.actor_id, r.actor_capacity) for r in rows] == [(user.id, "staff")]
    # The organiser's history does not name the staff member.
    from src.events import activity

    async with events_db() as events:
        entries = await activity.entries(
            events, entity_type="listing", entity_id=str(shop.listing_id)
        )
    staff_entries = [e for e in entries if e.actor_capacity == "staff"]
    assert staff_entries
    assert all(
        e.actor_name == "Barrels staff" and e.actor_id != user.id for e in staff_entries
    )


@pytest.mark.asyncio
async def test_staff_event_cancel_records_staff(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    _, headers = await _staff(db_async, "events-staff-manager")
    async with await _desk() as client:
        response = await client.post(
            f"{ORG}/events/{shop.listing_id}/cancel",
            headers=_with_org(headers, shop),
            json={"confirm": True, "refund": "none"},
        )
    assert response.status_code == 200, response.text
    async with events_db() as events:
        rows = list(
            await events.scalars(
                select(Activity).where(Activity.entity_id == str(shop.listing_id))
            )
        )
    assert rows
    assert {r.actor_capacity for r in rows} == {"staff"}


# --- emails and logging --------------------------------------------------------------


@pytest.mark.asyncio
async def test_staff_see_the_buyer_email_and_the_read_is_logged(
    db_async: AsyncSession,
    events_db: SessionFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id, raw = await _pending(db_async, shop)
    buyer = raw if isinstance(raw, User) else None
    assert buyer is not None
    user, headers = await _staff(db_async, "events-staff-manager")
    calls: list[tuple[str, dict[str, object]]] = []

    class Capture:
        def info(self, message: str, *, extra: dict[str, object]) -> None:
            calls.append((message, extra))

    monkeypatch.setattr(org_router, "logger", Capture())
    async with await _desk() as client:
        detail = await client.get(
            f"{ORG}/orders/{order_id}", headers=_with_org(headers, shop)
        )
        await client.get(
            f"{ORG}/events/{shop.listing_id}/orders",
            headers=_with_org(headers, shop),
        )
    assert detail.status_code == 200
    assert buyer.email in detail.text
    assert {extra["what"] for _, extra in calls} == {"orders.get", "orders.list"}
    for message, extra in calls:
        assert message == "Staff read of organiser data"
        assert extra["user_id"] == str(user.id)
        assert extra["organisation_id"] == shop.organisation_id
        assert extra["listing_id"] == str(shop.listing_id)
        assert buyer.email not in repr(extra)


# --- role expiry ---------------------------------------------------------------------


@pytest.mark.asyncio
async def test_role_assignment_expiry_decides_access(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    url = f"{ORG}/events/{shop.listing_id}/orders"
    now = utc_now()
    cases = {
        "expired": ("assignment", now - timedelta(minutes=5), 404),
        "future": ("assignment", now + timedelta(hours=1), 200),
        "open": ("assignment", None, 200),
        "link": ("link", None, 200),
    }
    async with await _desk() as client:
        for label, (how, end, expected) in cases.items():
            _, headers = await _staff(
                db_async, "events-staff-manager", how=how, effective_to=end
            )
            response = await client.get(url, headers=_with_org(headers, shop))
            assert response.status_code == expected, (label, response.text)


# --- rate limit ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_staff_writes_are_rate_limited_per_user_but_members_are_not(
    db_async: AsyncSession,
    events_db: SessionFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id, _ = await _pending(db_async, shop)
    user, headers = await _staff(db_async, "events-staff-refunds")
    hits: list[tuple[object, ...]] = []

    def hit(*args: object, **_kwargs: object) -> bool:
        hits.append(args)
        return False

    monkeypatch.setattr(limiter, "enabled", True)
    monkeypatch.setattr(limiter.limiter, "hit", hit)
    body = {"refund": "none"}
    async with await _desk() as client:
        staff = await client.post(
            f"{ORG}/orders/{order_id}/cancel",
            headers=_with_org(headers, shop),
            json=body,
        )
        from tests.organisations.support import headers_for

        member = await client.post(
            f"{ORG}/orders/{order_id}/cancel",
            headers=headers_for(shop.owner, shop.organisation_id),
            json=body,
        )
    assert staff.status_code == 429
    assert member.status_code == 200, member.text
    assert len(hits) == 1
    assert str(user.id) in hits[0]
    assert str(hits[0][0]) == "20 per 1 minute"


@pytest.mark.asyncio
async def test_till_limit_is_higher_than_refund_limit() -> None:
    assert org_router.STAFF_WRITE_LIMIT_TILL == "120/minute"
    assert org_router.STAFF_WRITE_LIMIT_MONEY == "20/minute"


# --- admin pickers -------------------------------------------------------------------


@pytest.mark.asyncio
async def test_pickers_list_events_and_organisers_without_emails(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    other = await _shop_with_events(db_async, events_db)
    _, headers = await _staff(db_async, "events-staff-manager")
    async with await _desk() as client:
        events = await client.get(f"{ADMIN}/events", headers=headers)
        organisers = await client.get(f"{ADMIN}/organisers", headers=headers)
        by_title = await client.get(
            f"{ADMIN}/events", headers=headers, params={"q": "paid fe"}
        )
        none = await client.get(
            f"{ADMIN}/events", headers=headers, params={"q": "zzz-none"}
        )
        far = await client.get(
            f"{ADMIN}/events",
            headers=headers,
            params={"from": (utc_now() + timedelta(days=30)).isoformat()},
        )
        paged = await client.get(f"{ADMIN}/events", headers=headers, params={"size": 1})
    assert events.status_code == organisers.status_code == 200
    listed = {row["listing_id"]: row for row in events.json()["data"]}
    assert str(shop.listing_id) in listed and str(other.listing_id) in listed
    assert listed[str(shop.listing_id)]["organisation_id"] == shop.organisation_id
    assert "@" not in events.text and "@" not in organisers.text
    assert {row["organisation_id"] for row in organisers.json()["data"]} >= {
        shop.organisation_id,
        other.organisation_id,
    }
    assert by_title.json()["count"] >= 2
    assert none.json()["count"] == 0
    assert far.json()["count"] == 0
    assert len(paged.json()["data"]) == 1 and paged.json()["count"] >= 2
    one = await _organiser_id(events_db, shop)
    async with await _desk() as client:
        filtered = await client.get(
            f"{ADMIN}/events", headers=headers, params={"organiser_id": str(one)}
        )
    assert [r["listing_id"] for r in filtered.json()["data"]] == [str(shop.listing_id)]


async def _organiser_id(events_db: SessionFactory, shop: Shop) -> uuid.UUID:
    from src.events.models import Listing

    async with events_db() as events:
        listing = await events.get(Listing, shop.listing_id)
        assert listing is not None
        return listing.organiser_id


@pytest.mark.asyncio
@pytest.mark.usefixtures("events_db")
async def test_picker_gate_roles_mfa_and_superuser(db_async: AsyncSession) -> None:
    _, door_plain = await _staff(db_async, "events-staff-door", mfa=False)
    _, till_plain = await _staff(db_async, "events-staff-till", mfa=False)
    _, till_mfa = await _staff(db_async, "events-staff-till")
    _, nobody = await _staff(db_async, None)
    _, root = await _staff(db_async, None, superuser=True)
    async with await _desk() as client:
        for path in ("events", "organisers"):
            url = f"{ADMIN}/{path}"
            assert (await client.get(url, headers=door_plain)).status_code == 200
            assert (await client.get(url, headers=till_plain)).status_code == 403
            assert (await client.get(url, headers=till_mfa)).status_code == 200
            assert (await client.get(url, headers=nobody)).status_code == 403
            assert (await client.get(url, headers=root)).status_code == 403


# --- registry ------------------------------------------------------------------------


def _pairs() -> dict[str, tuple[str, str]]:
    found: dict[str, tuple[str, str]] = {}

    def walk(dependant: object) -> list[tuple[str, str]]:
        pairs: list[tuple[str, str]] = []
        call = getattr(dependant, "call", None)
        pair = getattr(call, "key_pair", None)
        if pair is not None:
            pairs.append(pair)
        for sub in getattr(dependant, "dependencies", []):
            pairs.extend(walk(sub))
        return pairs

    for route in org_router.router.routes:
        operation_id = getattr(route, "operation_id", None)
        assert operation_id is not None
        pairs = walk(route.dependant)  # type: ignore[attr-defined]
        assert len(pairs) == 1, f"{operation_id} must have exactly one key pair"
        found[operation_id] = pairs[0]
    return found


def test_every_org_zone_events_route_maps_to_one_key_pair() -> None:
    assert _pairs() == org_router.ROUTE_KEYS


def test_every_staff_key_is_used_by_a_route() -> None:
    from src.auth.permissions import EVENTS_OPS_KEYS, PERMISSIONS

    used = {staff for _, staff in org_router.ROUTE_KEYS.values()}
    assert used == set(EVENTS_OPS_KEYS)
    bindings = {p.key: p.binding for p in PERMISSIONS}
    assert all(bindings[k] == "global" for k in EVENTS_OPS_KEYS)
    assert "events.ops.team" not in bindings
