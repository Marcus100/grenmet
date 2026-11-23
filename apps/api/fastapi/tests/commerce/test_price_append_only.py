"""``commerce.price`` is append-only, but erasing an organisation still cascades.

The trigger ``price_append_only`` (migration ``commerce20261123``) refuses UPDATE
and refuses a DELETE while the owning organisation exists. Erasing an
organisation deletes its products and prices after the organisation row is gone,
so that cascade is the only delete that succeeds.
"""

import httpx
import pytest
from sqlalchemy import delete, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.commerce.models import Price, Product
from src.organisations.models import PlatformOrganisation
from tests.commerce.support import (
    PRODUCTS_URL,
    create_product,
    entitled_org,
    org_headers,
)


async def _priced_product(
    async_client: httpx.AsyncClient, db: AsyncSession, name: str
) -> tuple[object, object, object]:
    owner, org = await entitled_org(db, name)
    product = await create_product(async_client, owner, org, f"{name} item")
    resp = await async_client.post(
        f"{PRODUCTS_URL}/{product['id']}/prices",
        headers=org_headers(owner, org, **{"Idempotency-Key": f"{name}-price"}),
        json={"amount_minor": 250},
    )
    assert resp.status_code == 201, resp.text
    return owner, org, resp.json()


async def test_update_of_a_price_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, org, price = await _priced_product(async_client, db_async, "Upd Co")
    with pytest.raises(DBAPIError, match="append-only"):
        async with db_async.begin_nested():
            await db_async.execute(
                text("UPDATE commerce.price SET amount_minor = 1 WHERE id = :id"),
                {"id": price["id"]},
            )
    still = await db_async.scalar(
        select(Price.amount_minor).where(Price.id == price["id"])
    )
    assert still == 250


async def test_direct_delete_of_a_price_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, org, price = await _priced_product(async_client, db_async, "Del Co")
    with pytest.raises(DBAPIError, match="append-only"):
        async with db_async.begin_nested():
            await db_async.execute(
                text("DELETE FROM commerce.price WHERE id = :id"), {"id": price["id"]}
            )
    assert await db_async.get(Price, price["id"]) is not None


async def test_deleting_a_product_with_prices_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, org, price = await _priced_product(async_client, db_async, "Prod Co")
    product_id = price["product_id"]
    with pytest.raises(DBAPIError, match="append-only"):
        async with db_async.begin_nested():
            await db_async.execute(
                text("DELETE FROM commerce.product WHERE id = :id"), {"id": product_id}
            )
    assert await db_async.get(Product, product_id) is not None


async def test_erasing_an_organisation_cascades_its_products_and_prices(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    _, org, price = await _priced_product(async_client, db_async, "Erase Co")
    product_id = price["product_id"]
    org_id = org.id
    await db_async.execute(
        delete(PlatformOrganisation).where(PlatformOrganisation.id == org_id)
    )
    await db_async.commit()
    db_async.expire_all()
    assert (
        await db_async.scalar(select(Price.id).where(Price.organisation_id == org_id))
        is None
    )
    assert await db_async.get(Product, product_id) is None
