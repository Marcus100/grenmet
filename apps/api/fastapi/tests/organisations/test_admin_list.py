"""Control plane (C1): superuser-only organisation list and detail."""

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations.models import MembershipRole, OrganisationStatus
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

URL = "/api/v1/organisations"


async def test_list_requires_a_superuser(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    org = await make_org(db_async, "Quiet Co", members=((owner, MembershipRole.OWNER),))
    assert (await async_client.get(URL)).status_code == 401
    # Even an organisation owner cannot list or read across organisations.
    assert (await async_client.get(URL, headers=headers_for(owner))).status_code == 403
    assert (
        await async_client.get(f"{URL}/{org.id}", headers=headers_for(owner))
    ).status_code == 403


async def test_superuser_lists_filters_and_counts(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    admin = await make_user(db_async, superuser=True)
    member = await make_user(db_async)
    other = await make_user(db_async)
    shared = await make_org(
        db_async,
        "Zz Control Test Co",
        members=((member, MembershipRole.OWNER), (other, MembershipRole.MEMBER)),
    )
    suspended = await make_org(db_async, "Zz Control Suspended")
    suspended.status = OrganisationStatus.SUSPENDED.value
    await db_async.commit()

    response = await async_client.get(
        URL, params={"q": "zz control"}, headers=headers_for(admin)
    )
    assert response.status_code == 200
    body = response.json()
    assert [row["name"] for row in body["data"]] == [
        "Zz Control Suspended",
        "Zz Control Test Co",
    ]
    assert body["count"] == 2
    rows = {row["id"]: row for row in body["data"]}
    assert rows[shared.id]["active_member_count"] == 2
    assert rows[suspended.id]["status"] == "suspended"

    only_suspended = await async_client.get(
        URL,
        params={"q": "zz control", "status": "suspended"},
        headers=headers_for(admin),
    )
    assert [row["id"] for row in only_suspended.json()["data"]] == [suspended.id]


async def test_superuser_reads_detail_and_unknown_is_404(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    admin = await make_user(db_async, superuser=True)
    org = await make_org(db_async, "Detail Co")
    response = await async_client.get(f"{URL}/{org.id}", headers=headers_for(admin))
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == org.id
    assert body["apps"] == []
    assert body["active_member_count"] == 0
    missing = await async_client.get(f"{URL}/org_missing", headers=headers_for(admin))
    assert missing.status_code == 404
