"""Shared setup for the commerce tests: organisations entitled to the app."""

from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.commerce.constants import APP_KEY
from src.organisations.models import MembershipRole, OrganisationApp
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

PRODUCTS_URL = "/api/v1/commerce/org/products"


async def entitled_org(
    db: AsyncSession,
    name: str,
    *,
    role: MembershipRole = MembershipRole.OWNER,
) -> tuple[Any, Any]:
    """An active organisation entitled to Commerce, with one member of ``role``.

    ``make_org(apps=...)`` refuses keys that are not in the entitlement catalogue,
    so the entitlement row is written directly (see ``src/commerce/AGENTS.md``).
    """
    user = await make_user(db)
    org = await make_org(db, name, members=((user, role),))
    db.add(OrganisationApp(organisation_id=org.id, app_key=APP_KEY, enabled=True))
    await db.commit()
    return user, org


def org_headers(user: Any, org: Any, **extra: str) -> dict[str, str]:
    return {**headers_for(user, org.id), **extra}


async def create_product(
    client: Any, user: Any, org: Any, name: str = "Milk 1L"
) -> dict[str, Any]:
    resp = await client.post(
        PRODUCTS_URL,
        headers=org_headers(user, org, **{"Idempotency-Key": f"key-{name}"}),
        json={"name": name, "base_unit": "each"},
    )
    assert resp.status_code == 201, resp.text
    body: dict[str, Any] = resp.json()
    return body
