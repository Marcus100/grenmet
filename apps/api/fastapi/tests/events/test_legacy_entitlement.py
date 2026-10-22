"""The ``events`` entitlement is a kill switch for the legacy /events/manage/* routes
too (ADR-0044 S5, phase 1).

Organisers linked to an organisation need that organisation's enabled ``events``
entitlement; unlinked legacy organisers (``organisation_id`` NULL) have no organisation
to switch off and are unchanged. Responses and identity rules do not change."""

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User as UserModel
from src.organisations.models import OrganisationApp
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import BASE, SessionFactory, client_with_real_roles
from tests.events.test_org_orders import _shop_with_events
from tests.events.test_org_permissions import _member
from tests.events.test_organiser_admin import _organiser, _payload
from tests.events.test_paid_orders import Shop, make_user

MANAGE = f"{BASE}/manage"
REFUSED = "Barrels Events isn't enabled for this organisation"


async def _set_events(db: AsyncSession, shop: Shop, *, enabled: bool) -> None:
    await db.execute(
        update(OrganisationApp)
        .where(
            OrganisationApp.organisation_id == shop.organisation_id,
            OrganisationApp.app_key == "events",
        )
        .values(enabled=enabled)
    )
    await db.commit()


@dataclass(frozen=True)
class Route:
    name: str
    call: Callable[[httpx.AsyncClient, Shop], Awaitable[httpx.Response]]
    on: tuple[int, ...]  # acceptable statuses with the entitlement on


def _soon() -> str:
    return f"{(utc_now() + timedelta(days=20)).replace(microsecond=0).isoformat()}Z"


ROUTES = [
    # Reads.
    Route("workspace", lambda c, s: c.get(MANAGE), (200,)),
    Route("settlement-all", lambda c, s: c.get(f"{MANAGE}/settlement"), (200,)),
    Route(
        "settlement",
        lambda c, s: c.get(f"{MANAGE}/{s.listing_id}/settlement"),
        (200,),
    ),
    Route(
        "settlement-csv",
        lambda c, s: c.get(f"{MANAGE}/{s.listing_id}/settlement.csv"),
        (200,),
    ),
    Route("manifest", lambda c, s: c.get(f"{MANAGE}/{s.listing_id}/manifest"), (200,)),
    Route("outlet", lambda c, s: c.get(f"{MANAGE}/{s.listing_id}/outlet"), (200,)),
    Route("activity", lambda c, s: c.get(f"{MANAGE}/{s.listing_id}/activity"), (200,)),
    # Writes, including the money ones (cash till, outlet sale, refund, cancel).
    Route(
        "till-open",
        lambda c, s: c.post(
            f"{MANAGE}/{s.listing_id}/outlet/till", json={"opening_float_minor": 0}
        ),
        (201, 409),  # 409 on the repeat: a till is already open today
    ),
    Route(
        "outlet-sale",
        lambda c, s: c.post(
            f"{MANAGE}/{s.listing_id}/outlet/sales",
            json={
                "items": [{"tier_id": str(s.tier_id), "quantity": 1}],
                "amount_collected_minor": 0,
            },
        ),
        (201, 409),  # 409: no open till, still past the gate
    ),
    Route(
        "refund-ticket",
        lambda c, s: c.post(
            f"{MANAGE}/{s.listing_id}/tickets/{uuid.uuid4()}/refund",
            json={"amount_minor": 100, "method": "cash"},
        ),
        (404, 409),
    ),
    Route(
        "admit",
        lambda c, s: c.post(
            f"{MANAGE}/{s.listing_id}/admissions", json={"code": "NOSUCHCODE"}
        ),
        (404, 409),
    ),
    Route(
        "postpone",
        lambda c, s: c.post(
            f"{MANAGE}/{s.listing_id}/postpone",
            json={"starts_at": _soon(), "ends_at": _soon()},
        ),
        (200, 409),
    ),
    Route(
        "cancel",
        lambda c, s: c.post(
            f"{MANAGE}/{s.listing_id}/cancel", json={"confirm": True, "refund": "none"}
        ),
        (200, 409),  # 409 on the repeat: already cancelled
    ),
    Route(
        "create-listing",
        lambda c, s: c.post(f"{MANAGE}/listings", json=_payload(status="draft")),
        (201,),
    ),
    Route(
        "update-listing",
        lambda c, s: c.put(
            f"{MANAGE}/listings/{s.listing_id}", json=_payload(status="draft")
        ),
        (200,),
    ),
    Route(
        "logo",
        lambda c, s: c.put(f"{MANAGE}/organiser/logo", json={"file_id": None}),
        (200,),
    ),
    Route("resubmit", lambda c, s: c.post(f"{MANAGE}/organiser/resubmit"), (409,)),
]


@pytest.mark.asyncio
@pytest.mark.parametrize("route", ROUTES, ids=lambda r: r.name)
async def test_entitlement_off_refuses_and_on_is_unchanged(
    route: Route, db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    async with client_with_real_roles(shop.owner) as client:
        before = await route.call(client, shop)
        assert before.status_code in route.on, before.text

    await _set_events(db_async, shop, enabled=False)
    async with client_with_real_roles(shop.owner) as client:
        off = await route.call(client, shop)
    assert off.status_code == 403, off.text
    assert off.json()["detail"] == REFUSED

    await _set_events(db_async, shop, enabled=True)
    async with client_with_real_roles(shop.owner) as client:
        again = await route.call(client, shop)
    assert again.status_code in route.on, again.text


@pytest.mark.asyncio
async def test_a_missing_entitlement_row_refuses(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    row = await db_async.scalar(
        select(OrganisationApp).where(
            OrganisationApp.organisation_id == shop.organisation_id,
            OrganisationApp.app_key == "events",
        )
    )
    assert row is not None
    await db_async.delete(row)
    await db_async.commit()
    async with client_with_real_roles(shop.owner) as client:
        assert (await client.get(MANAGE)).status_code == 403
        assert (
            await client.get(f"{MANAGE}/{shop.listing_id}/settlement")
        ).status_code == 403


@pytest.mark.asyncio
async def test_unlinked_legacy_organiser_is_unchanged(
    events_db: SessionFactory, db_async: AsyncSession
) -> None:
    user = await _organiser(events_db, db_async)
    async with client_with_real_roles(user) as client:
        workspace = await client.get(MANAGE)
        assert workspace.status_code == 200
        assert workspace.json()["organisation_id"] is None
        assert (await client.get(f"{MANAGE}/settlement")).status_code == 200
        assert (
            await client.post(f"{MANAGE}/listings", json=_payload(status="draft"))
        ).status_code == 201


@pytest.mark.asyncio
async def test_superuser_owner_follows_the_switch_and_staff_without_org_is_unchanged(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    row = await db_async.get(UserModel, shop.owner.id)
    assert row is not None
    row.is_superuser = True
    await db_async.commit()
    shop.owner.is_superuser = True
    # A staff member holding the legacy permission but no organisation: refused as before.
    staff = await user_with_role(db_async, "events-organiser")
    async with client_with_real_roles(shop.owner) as client:
        assert (await client.get(MANAGE)).status_code == 200
    async with client_with_real_roles(staff) as client:
        refused = await client.get(MANAGE)
        assert refused.status_code == 403
        assert refused.json()["detail"] != REFUSED
    await _set_events(db_async, shop, enabled=False)
    async with client_with_real_roles(shop.owner) as client:
        assert (await client.get(MANAGE)).status_code == 403


@pytest.mark.asyncio
async def test_a_grant_alone_still_opens_nothing_with_or_without_the_switch(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    member = await _member(db_async, shop, "events-manager")
    for enabled in (True, False):
        await _set_events(db_async, shop, enabled=enabled)
        async with client_with_real_roles(member) as client:
            assert (await client.get(MANAGE)).status_code == 403
            assert (
                await client.get(f"{MANAGE}/{shop.listing_id}/settlement")
            ).status_code == 403
            assert (
                await client.post(
                    f"{MANAGE}/{shop.listing_id}/cancel",
                    json={"confirm": True, "refund": "none"},
                )
            ).status_code == 403


@pytest.mark.asyncio
async def test_only_entitled_organisers_are_listed_and_chosen(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    """A member of two organisations keeps the one that is entitled; naming the
    switched-off organiser is refused with the entitlement message."""
    from src.events.models import Organiser
    from src.organisations.models import MembershipRole
    from tests.organisations.support import make_org

    user = await make_user(db_async)
    on = await make_org(
        db_async, "On Co", members=((user, MembershipRole.OWNER),), apps=("events",)
    )
    off = await make_org(db_async, "Off Co", members=((user, MembershipRole.OWNER),))
    async with events_db() as db:
        db.add_all(
            [
                Organiser(slug="on-co", name="On Co", organisation_id=on.id),
                Organiser(slug="off-co", name="Off Co", organisation_id=off.id),
            ]
        )
        await db.commit()
    async with client_with_real_roles(user) as client:
        workspace = await client.get(MANAGE)
        assert workspace.status_code == 200
        body: dict[str, Any] = workspace.json()
        assert [o["slug"] for o in body["organisers"]] == ["on-co"]
        named = await client.get(MANAGE, params={"organiser": "off-co"})
        assert named.status_code == 403
        assert named.json()["detail"] == REFUSED
