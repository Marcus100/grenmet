"""Commerce catalogue routes (ADR-0063 slice 0): products and price history.

Every route is organisation-bound (ADR-0044). Money is integer minor units with
a currency; quantities are not part of this slice.
"""

from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.commerce.models import Price, Product
from src.organisations.models import MembershipRole
from src.utils.datetime import utc_now
from tests.commerce.support import (
    PRODUCTS_URL,
    create_product,
    entitled_org,
    org_headers,
)
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org


def _prices_url(product_id: str) -> str:
    return f"{PRODUCTS_URL}/{product_id}/prices"


async def test_owner_creates_lists_and_reads_a_product(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, org = await entitled_org(db_async, "Shop One")
    created = await create_product(async_client, owner, org, "Milk 1L")
    assert created["name"] == "Milk 1L"
    assert created["base_unit"] == "each"
    assert created["current_price"] is None

    listed = await async_client.get(PRODUCTS_URL, headers=org_headers(owner, org))
    assert listed.status_code == 200, listed.text
    body = listed.json()
    assert body["count"] == 1
    assert [row["id"] for row in body["data"]] == [created["id"]]

    one = await async_client.get(
        f"{PRODUCTS_URL}/{created['id']}", headers=org_headers(owner, org)
    )
    assert one.status_code == 200
    assert one.json()["id"] == created["id"]


async def test_current_price_follows_effective_date_not_insert_order(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, org = await entitled_org(db_async, "Shop Two")
    product = await create_product(async_client, owner, org)
    headers = org_headers(owner, org)
    now = utc_now()

    def add(amount: int, when: Any, key: str) -> httpx.Response:
        return async_client.post(
            _prices_url(product["id"]),
            headers={**headers, "Idempotency-Key": key},
            json={
                "amount_minor": amount,
                "currency": "XCD",
                "effective_from": when.isoformat() + "Z",
            },
        )

    assert (await add(500, now - timedelta(days=2), "p1")).status_code == 201
    assert (await add(600, now - timedelta(days=1), "p2")).status_code == 201
    # Scheduled for later: must not be the current price yet.
    assert (await add(700, now + timedelta(days=1), "p3")).status_code == 201

    one = await async_client.get(f"{PRODUCTS_URL}/{product['id']}", headers=headers)
    current = one.json()["current_price"]
    assert current is not None
    assert current["amount_minor"] == 600
    assert current["currency"] == "XCD"


async def test_price_history_is_newest_first_and_paginated(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, org = await entitled_org(db_async, "Shop Three")
    product = await create_product(async_client, owner, org)
    headers = org_headers(owner, org)
    now = utc_now()
    for index, amount in enumerate((100, 200, 300)):
        resp = await async_client.post(
            _prices_url(product["id"]),
            headers={**headers, "Idempotency-Key": f"h{index}"},
            json={
                "amount_minor": amount,
                "effective_from": (now - timedelta(days=3 - index)).isoformat() + "Z",
            },
        )
        assert resp.status_code == 201, resp.text

    page = await async_client.get(
        _prices_url(product["id"]), headers=headers, params={"size": 2}
    )
    body = page.json()
    assert body["count"] == 3
    assert body["total_pages"] == 2
    assert [row["amount_minor"] for row in body["data"]] == [300, 200]


async def test_duplicate_product_name_is_409(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, org = await entitled_org(db_async, "Shop Four")
    await create_product(async_client, owner, org, "Bread")
    again = await async_client.post(
        PRODUCTS_URL,
        headers=org_headers(owner, org, **{"Idempotency-Key": "dup-bread"}),
        json={"name": "Bread", "base_unit": "each"},
    )
    assert again.status_code == 409, again.text


async def test_same_price_instant_twice_is_409(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, org = await entitled_org(db_async, "Shop Five")
    product = await create_product(async_client, owner, org)
    when = (utc_now() - timedelta(days=1)).isoformat() + "Z"
    headers = org_headers(owner, org)
    first = await async_client.post(
        _prices_url(product["id"]),
        headers={**headers, "Idempotency-Key": "same-1"},
        json={"amount_minor": 100, "effective_from": when},
    )
    assert first.status_code == 201
    second = await async_client.post(
        _prices_url(product["id"]),
        headers={**headers, "Idempotency-Key": "same-2"},
        json={"amount_minor": 150, "effective_from": when},
    )
    assert second.status_code == 409, second.text


async def test_unknown_product_is_404(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, org = await entitled_org(db_async, "Shop Six")
    headers = org_headers(owner, org)
    missing = "00000000-0000-0000-0000-000000000001"
    assert (
        await async_client.get(f"{PRODUCTS_URL}/{missing}", headers=headers)
    ).status_code == 404
    assert (
        await async_client.get(_prices_url(missing), headers=headers)
    ).status_code == 404
    assert (
        await async_client.post(
            _prices_url(missing),
            headers={**headers, "Idempotency-Key": "x"},
            json={"amount_minor": 1},
        )
    ).status_code == 404


async def test_create_replays_the_same_key_and_refuses_a_different_body(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, org = await entitled_org(db_async, "Shop Seven")
    headers = org_headers(owner, org, **{"Idempotency-Key": "retry-me"})
    first = await async_client.post(
        PRODUCTS_URL, headers=headers, json={"name": "Rice", "base_unit": "kg"}
    )
    assert first.status_code == 201, first.text
    replay = await async_client.post(
        PRODUCTS_URL, headers=headers, json={"name": "Rice", "base_unit": "kg"}
    )
    assert replay.status_code == 201
    assert replay.json()["id"] == first.json()["id"]
    assert replay.headers.get("Idempotency-Replayed") == "true"

    other = await async_client.post(
        PRODUCTS_URL, headers=headers, json={"name": "Flour", "base_unit": "kg"}
    )
    assert other.status_code == 409

    rows = await db_async.scalars(
        select(Product).where(Product.organisation_id == org.id)
    )
    assert [row.name for row in rows] == ["Rice"]


@pytest.mark.parametrize("method", ["post_product", "post_price"])
async def test_write_without_idempotency_key_is_400(
    method: str, async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, org = await entitled_org(db_async, "Shop Eight")
    headers = org_headers(owner, org)
    if method == "post_product":
        resp = await async_client.post(
            PRODUCTS_URL, headers=headers, json={"name": "Tea", "base_unit": "each"}
        )
    else:
        product = await create_product(async_client, owner, org)
        resp = await async_client.post(
            _prices_url(product["id"]), headers=headers, json={"amount_minor": 5}
        )
    assert resp.status_code == 400, resp.text


async def test_missing_organisation_header_is_400(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, _ = await entitled_org(db_async, "Shop Nine")
    resp = await async_client.get(PRODUCTS_URL, headers=headers_for(owner))
    assert resp.status_code == 400, resp.text


@pytest.mark.parametrize(
    "body",
    [
        {"amount_minor": -1},
        {"amount_minor": 12.5},
        {"amount_minor": "500"},
        {"amount_minor": True},
        {"amount_minor": 10_000_000_001},
        {"amount_minor": 500, "currency": "USD"},
        {"amount_minor": 500, "currency": "xcd"},
        {"currency": "XCD"},
    ],
)
async def test_invalid_money_is_422(
    body: dict[str, Any], async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, org = await entitled_org(db_async, "Shop Ten")
    product = await create_product(async_client, owner, org)
    resp = await async_client.post(
        _prices_url(product["id"]),
        headers=org_headers(owner, org, **{"Idempotency-Key": "money"}),
        json=body,
    )
    assert resp.status_code == 422, resp.text


async def test_currency_defaults_to_xcd_and_zero_is_allowed(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, org = await entitled_org(db_async, "Shop Eleven")
    product = await create_product(async_client, owner, org)
    resp = await async_client.post(
        _prices_url(product["id"]),
        headers=org_headers(owner, org, **{"Idempotency-Key": "zero"}),
        json={"amount_minor": 0},
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["currency"] == "XCD"
    assert resp.json()["amount_minor"] == 0


async def test_database_refuses_negative_amount_and_other_currency(
    db_async: AsyncSession,
) -> None:
    owner = await make_user(db_async)
    org = await make_org(
        db_async, "Shop Twelve", members=((owner, MembershipRole.OWNER),)
    )
    product = Product(organisation_id=org.id, name="Salt", base_unit="kg")
    db_async.add(product)
    await db_async.flush()
    for amount, currency in ((-5, "XCD"), (5, "USD")):
        with pytest.raises(IntegrityError):
            async with db_async.begin_nested():
                db_async.add(
                    Price(
                        organisation_id=org.id,
                        product_id=product.id,
                        amount_minor=amount,
                        currency=currency,
                        effective_from=utc_now(),
                    )
                )
                await db_async.flush()
    await db_async.rollback()


@pytest.mark.parametrize(
    ("role", "entitled"),
    [(MembershipRole.MEMBER, True), (MembershipRole.OWNER, False)],
)
async def test_member_without_key_or_unentitled_org_is_403(
    role: MembershipRole,
    entitled: bool,
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    org = await make_org(db_async, "Shop Thirteen", members=((user, role),))
    if entitled:
        from src.commerce.constants import APP_KEY
        from src.organisations.models import OrganisationApp

        db_async.add(
            OrganisationApp(organisation_id=org.id, app_key=APP_KEY, enabled=True)
        )
        await db_async.commit()
    headers = org_headers(user, org)
    assert (await async_client.get(PRODUCTS_URL, headers=headers)).status_code == 403
    write = await async_client.post(
        PRODUCTS_URL,
        headers={**headers, "Idempotency-Key": "denied"},
        json={"name": "Nope", "base_unit": "each"},
    )
    assert write.status_code == 403, write.text


async def test_superuser_without_membership_gets_no_bypass(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner, org = await entitled_org(db_async, "Shop Fourteen")
    await create_product(async_client, owner, org)
    superuser = await make_user(db_async, superuser=True)
    resp = await async_client.get(PRODUCTS_URL, headers=org_headers(superuser, org))
    assert resp.status_code == 404, resp.text
