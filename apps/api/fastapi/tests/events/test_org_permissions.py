"""Organisation-bound Events keys on every org-zone route (ADR-0044, S2).

Per route: a plain member without a grant gets 403, a member holding the route's
key passes (200/201), a member holding a different key gets 403, and a holder of
the right key in another organisation gets 404 for this organisation's data.
Superusers get no bypass. Keys come from ``role_bundles``."""

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import cast

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.utils import create_access_token
from src.organisations import service as org_service
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    new_grant_id,
)
from src.utils.datetime import utc_now
from tests.events.support import BASE, SessionFactory, client_with_real_roles
from tests.events.test_org_orders import (
    ORG,
    _desk,
    _paid,
    _pending,
    _shop_with_events,
)
from tests.events.test_paid_orders import Shop, make_user
from tests.organisations.support import headers_for


async def _member(db: AsyncSession, shop: Shop, role_key: str | None) -> User:
    """A plain member of the shop's organisation holding ``role_key`` (if any)."""
    user = await make_user(db)
    await org_service.add_member(
        db,
        organisation_id=shop.organisation_id,
        user_id=user.id,
        role=MembershipRole.MEMBER,
    )
    await db.commit()
    if role_key is not None:
        membership = await db.scalar(
            select(Membership).where(
                Membership.organisation_id == shop.organisation_id,
                Membership.user_id == user.id,
            )
        )
        assert membership is not None
        db.add(
            MembershipGrant(
                id=new_grant_id(),
                membership_id=membership.id,
                organisation_id=shop.organisation_id,
                role_key=role_key,
                granted_at=utc_now(),
            )
        )
        await db.commit()
    return user


@dataclass(frozen=True)
class Route:
    name: str
    role_key: str  # a bundle holding the route's key
    wrong_key: str  # a bundle that does not
    # (client, headers, order_id, shop) -> response
    call: Callable[
        [httpx.AsyncClient, dict[str, str], str, Shop], Awaitable[httpx.Response]
    ]
    needs_paid: bool = False  # the order must be paid (refund) rather than pending
    ok: int = 200


def _idem(headers: dict[str, str]) -> dict[str, str]:
    return {**headers, "Idempotency-Key": f"k-{uuid.uuid4().hex}"}


ROUTES = [
    Route(
        "list-orders",
        "events-manager",
        "events-door",
        lambda c, h, o, s: c.get(f"{ORG}/events/{s.listing_id}/orders", headers=h),
    ),
    Route(
        "get-order",
        "events-manager",
        "events-door",
        lambda c, h, o, s: c.get(f"{ORG}/orders/{o}", headers=h),
    ),
    Route(
        "list-attendees",
        "events-door",
        "events-till",
        lambda c, h, o, s: c.get(f"{ORG}/events/{s.listing_id}/attendees", headers=h),
    ),
    Route(
        "manual-payment",
        "events-till",
        "events-door",
        lambda c, h, o, s: c.post(
            f"{ORG}/orders/{o}/manual-payments",
            headers=_idem(h),
            json={"method": "cash"},
        ),
        ok=201,
    ),
    Route(
        "refund-order",
        "events-refunds",
        "events-till",
        lambda c, h, o, s: c.post(
            f"{ORG}/orders/{o}/refunds",
            headers=_idem(h),
            json={"reason": "Event issue"},
        ),
        needs_paid=True,
        ok=201,
    ),
    Route(
        "cancel-order",
        "events-refunds",
        "events-manager",
        lambda c, h, o, s: c.post(
            f"{ORG}/orders/{o}/cancel", headers=h, json={"refund": "none"}
        ),
    ),
    Route(
        "cancel-event",
        "events-manager",
        "events-refunds",
        lambda c, h, o, s: c.post(
            f"{ORG}/events/{s.listing_id}/cancel",
            headers=h,
            json={"confirm": True, "refund": "none"},
        ),
    ),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("route", ROUTES, ids=lambda r: r.name)
async def test_each_org_route_needs_its_own_key(
    route: Route, db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db, allocation=10)
    other = await _shop_with_events(db_async, events_db)
    order_id = (
        await _paid(db_async, shop)
        if route.needs_paid
        else (await _pending(db_async, shop))[0]
    )

    plain = await _member(db_async, shop, None)
    wrong = await _member(db_async, shop, route.wrong_key)
    right = await _member(db_async, shop, route.role_key)
    foreign = await _member(db_async, other, route.role_key)

    def headers(user: User, org: Shop) -> dict[str, str]:
        return headers_for(user, org.organisation_id)

    async with await _desk() as client:
        assert (
            await route.call(client, headers(plain, shop), order_id, shop)
        ).status_code == 403
        assert (
            await route.call(client, headers(wrong, shop), order_id, shop)
        ).status_code == 403
        # Right key in the other organisation: this organisation's data is not found.
        assert (
            await route.call(client, headers(foreign, other), order_id, shop)
        ).status_code == 404
        allowed = await route.call(client, headers(right, shop), order_id, shop)
        assert allowed.status_code == route.ok, allowed.text


@pytest.mark.asyncio
async def test_a_key_does_not_work_without_the_events_entitlement(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    right = await _member(db_async, shop, "events-manager")
    async with await _desk() as client:
        url = f"{ORG}/events/{shop.listing_id}/orders"
        headers = headers_for(right, shop.organisation_id)
        assert (await client.get(url, headers=headers)).status_code == 200
    from sqlalchemy import update

    from src.organisations.models import OrganisationApp

    await db_async.execute(
        update(OrganisationApp)
        .where(
            OrganisationApp.organisation_id == shop.organisation_id,
            OrganisationApp.app_key == "events",
        )
        .values(enabled=False)
    )
    await db_async.commit()
    async with await _desk() as client:
        assert (await client.get(url, headers=headers)).status_code == 403


@pytest.mark.asyncio
async def test_a_superuser_without_membership_gets_no_bypass(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    from src.auth.models import User as UserModel

    root = await make_user(db_async)
    row = await db_async.get(UserModel, root.id)
    assert row is not None
    row.is_superuser = True
    await db_async.commit()
    async with await _desk() as client:
        response = await client.get(
            f"{ORG}/events/{shop.listing_id}/orders",
            headers=headers_for(root, shop.organisation_id),
        )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_only_admins_and_owners_see_the_buyer_email(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    order_id, raw_buyer = await _pending(db_async, shop)
    buyer = cast(User, raw_buyer)
    manager = await _member(db_async, shop, "events-manager")
    async with await _desk() as client:
        by_manager = await client.get(
            f"{ORG}/orders/{order_id}",
            headers=headers_for(manager, shop.organisation_id),
        )
        by_owner = await client.get(
            f"{ORG}/orders/{order_id}",
            headers=headers_for(shop.owner, shop.organisation_id),
        )
    assert by_manager.status_code == by_owner.status_code == 200
    assert buyer.email not in by_manager.text
    assert buyer.email in by_owner.text


@pytest.mark.asyncio
async def test_expired_and_revoked_grants_give_nothing(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    expired = await _member(db_async, shop, "events-manager")
    revoked = await _member(db_async, shop, "events-manager")
    now = utc_now()
    for user, column in ((expired, "expires_at"), (revoked, "revoked_at")):
        membership = await db_async.scalar(
            select(Membership).where(
                Membership.organisation_id == shop.organisation_id,
                Membership.user_id == user.id,
            )
        )
        assert membership is not None
        grant = await db_async.scalar(
            select(MembershipGrant).where(
                MembershipGrant.membership_id == membership.id
            )
        )
        assert grant is not None
        setattr(grant, column, now - timedelta(minutes=5))
    await db_async.commit()
    url = f"{ORG}/events/{shop.listing_id}/orders"
    async with await _desk() as client:
        for user in (expired, revoked):
            response = await client.get(
                url, headers=headers_for(user, shop.organisation_id)
            )
            assert response.status_code == 403


@pytest.mark.asyncio
async def test_a_token_for_another_app_is_refused(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    token = create_access_token(
        shop.owner.id, expires_delta=timedelta(minutes=5), app="bookings"
    )
    async with await _desk() as client:
        response = await client.get(
            f"{ORG}/events/{shop.listing_id}/orders",
            headers={
                "Authorization": f"Bearer {token}",
                "X-Barrels-Organisation": shop.organisation_id,
            },
        )
    assert response.status_code in (401, 403), response.status_code


@pytest.mark.asyncio
async def test_a_grant_alone_does_not_open_legacy_manage_routes(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    """Legacy /events/manage/* still uses the organiser gate (owner/admin or the
    legacy permission), so an organisation grant on a plain member opens nothing
    there. Documents why the entitlement is not yet a kill switch for owners."""
    shop = await _shop_with_events(db_async, events_db)
    member = await _member(db_async, shop, "events-manager")
    async with client_with_real_roles(member) as client:
        response = await client.get(f"{BASE}/manage")
    assert response.status_code == 403
