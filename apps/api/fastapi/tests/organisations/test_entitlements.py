"""Request-time entitlement checks (``require_org_app``) on organisation routes."""

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations import entitlements, service
from src.organisations.dependencies import require_org_app
from src.organisations.models import MembershipRole
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

BOOKINGS = "/api/v1/bookings/org/services"
REWARDS = "/api/v1/rewards/programs"


def test_catalogue_covers_apps_and_products() -> None:
    keys = {option.key for option in entitlements.options()}
    assert {"bookings", "rewards", "events", "gmsdash"} <= keys
    assert entitlements.is_known("bookings")
    assert not entitlements.is_known("nope")
    with pytest.raises(ValueError):
        require_org_app("nope")


@pytest.mark.parametrize(
    ("url", "app_key"), [(BOOKINGS, "bookings"), (REWARDS, "rewards")]
)
async def test_entitlement_is_checked_after_membership(
    async_client: httpx.AsyncClient, db_async: AsyncSession, url: str, app_key: str
) -> None:
    owner, outsider = await make_user(db_async), await make_user(db_async)
    org = await make_org(
        db_async, "Unentitled", members=((owner, MembershipRole.OWNER),)
    )

    # Outsiders learn nothing: 404 before any entitlement check.
    outside = await async_client.get(url, headers=headers_for(outsider, org.id))
    assert outside.status_code == 404
    missing = await async_client.get(url, headers=headers_for(owner))
    assert missing.status_code == 400

    refused = await async_client.get(url, headers=headers_for(owner, org.id))
    assert refused.status_code == 403
    assert "not entitled" in refused.json()["detail"]

    await service.set_app_enabled(
        db_async, organisation_id=org.id, app_key=app_key, enabled=True
    )
    await db_async.commit()
    assert (
        await async_client.get(url, headers=headers_for(owner, org.id))
    ).status_code == 200

    await service.set_app_enabled(
        db_async, organisation_id=org.id, app_key=app_key, enabled=False
    )
    await db_async.commit()
    assert (
        await async_client.get(url, headers=headers_for(owner, org.id))
    ).status_code == 403


async def test_control_plane_can_grant_products(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin = await make_user(db_async, superuser=True)
    org = await make_org(db_async, "Grant Co")
    resp = await async_client.put(
        f"/api/v1/organisations/{org.id}/apps/bookings",
        headers=headers_for(admin),
        json={"enabled": True},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert {"app_key": "bookings", "enabled": True} in body["apps"]
    assert {"key": "rewards", "label": "Barrels Rewards"} in body["available_apps"]
    unknown = await async_client.put(
        f"/api/v1/organisations/{org.id}/apps/nope",
        headers=headers_for(admin),
        json={"enabled": True},
    )
    assert unknown.status_code == 422
