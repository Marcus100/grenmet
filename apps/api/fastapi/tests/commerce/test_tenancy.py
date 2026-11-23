"""Tenancy inventory and cross-organisation harness (ADR-0063, decision 2.10).

A new commerce table without ``organisation_id``, or a new ``/commerce/org``
operation without a cross-organisation case below, fails here on purpose.
"""

from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.commerce.constants import APP_KEY
from src.main import app
from src.organisations.models import MembershipRole, OrganisationApp
from src.orm import Base
from tests.commerce.support import (
    PRODUCTS_URL,
    create_product,
    entitled_org,
    org_headers,
)
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

ORG_PREFIX = "/api/v1/commerce/org"
PRODUCT_ID = "{product_id}"
VICTIM_PRODUCT_PATH = f"{ORG_PREFIX}/products/{PRODUCT_ID}"

#: Every /commerce/org operation -> a valid body for writes (None for reads).
#: Adding a route without a row here fails test_every_org_operation_is_covered.
OPERATIONS: dict[tuple[str, str], dict[str, Any] | None] = {
    ("get", f"{ORG_PREFIX}/products"): None,
    ("post", f"{ORG_PREFIX}/products"): {"name": "Harness", "base_unit": "each"},
    ("get", VICTIM_PRODUCT_PATH): None,
    ("get", f"{VICTIM_PRODUCT_PATH}/prices"): None,
    ("post", f"{VICTIM_PRODUCT_PATH}/prices"): {"amount_minor": 100},
}


def test_every_commerce_table_carries_organisation_id() -> None:
    commerce = [t for t in Base.metadata.tables.values() if t.schema == "commerce"]
    assert commerce, "the commerce schema has no tables"
    missing = [t.fullname for t in commerce if "organisation_id" not in t.c]
    assert missing == [], f"commerce tables without organisation_id: {missing}"


def test_every_org_operation_is_covered() -> None:
    spec = app.openapi()
    found = {
        (method, path)
        for path, item in spec["paths"].items()
        if path.startswith(ORG_PREFIX)
        for method in item
        if method in {"get", "post", "put", "patch", "delete"}
    }
    covered = set(OPERATIONS)
    assert found == covered, (
        f"uncovered: {sorted(found - covered)}; stale: {sorted(covered - found)}"
    )


async def _victim_product(
    async_client: httpx.AsyncClient, db: AsyncSession
) -> tuple[Any, Any, dict[str, Any]]:
    victim_user, victim_org = await entitled_org(db, "Victim Co")
    product = await create_product(async_client, victim_user, victim_org, "Secret Cola")
    return victim_user, victim_org, product


@pytest.mark.parametrize(
    ("method", "path"), [key for key in OPERATIONS if PRODUCT_ID in key[1]]
)
async def test_other_organisations_product_answers_404(
    method: str,
    path: str,
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    _, victim_org, product = await _victim_product(async_client, db_async)
    attacker, attacker_org = await entitled_org(db_async, "Attacker Co")
    body = OPERATIONS[(method, path)]
    url = path.replace(PRODUCT_ID, product["id"])
    headers = org_headers(attacker, attacker_org, **{"Idempotency-Key": "probe"})
    resp = await async_client.request(method.upper(), url, headers=headers, json=body)
    assert resp.status_code == 404, f"{method} {url}: {resp.status_code} {resp.text}"


@pytest.mark.parametrize(("method", "path"), list(OPERATIONS))
async def test_naming_another_organisation_in_the_header_answers_404(
    method: str,
    path: str,
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    victim_user, victim_org, product = await _victim_product(async_client, db_async)
    attacker, _ = await entitled_org(db_async, "Header Probe Co")
    body = OPERATIONS[(method, path)]
    url = path.replace(PRODUCT_ID, product["id"])
    headers = headers_for(attacker, victim_org.id) | {"Idempotency-Key": "probe"}
    resp = await async_client.request(method.upper(), url, headers=headers, json=body)
    assert resp.status_code == 404, f"{method} {url}: {resp.status_code} {resp.text}"


async def test_product_list_shows_only_the_callers_organisation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    victim_user, victim_org = await entitled_org(db_async, "List Victim")
    await create_product(async_client, victim_user, victim_org, "Victim Only")
    owner, org = await entitled_org(db_async, "List Owner")
    await create_product(async_client, owner, org, "Mine")
    resp = await async_client.get(PRODUCTS_URL, headers=org_headers(owner, org))
    names = [row["name"] for row in resp.json()["data"]]
    assert names == ["Mine"]


async def test_a_member_of_two_organisations_sees_each_separately(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    first = await make_org(db_async, "Two A", members=((user, MembershipRole.OWNER),))
    second = await make_org(db_async, "Two B", members=((user, MembershipRole.OWNER),))
    for org in (first, second):
        db_async.add(
            OrganisationApp(organisation_id=org.id, app_key=APP_KEY, enabled=True)
        )
    await db_async.commit()
    await create_product(async_client, user, first, "Only in A")
    resp = await async_client.get(PRODUCTS_URL, headers=org_headers(user, second))
    assert resp.status_code == 200
    assert resp.json()["data"] == []
