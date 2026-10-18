"""``GET /models/organisations``: the caller's organisations and their standing."""

from datetime import timedelta

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.utils import create_access_token
from src.organisations.models import MembershipRole
from tests.events.roles import user_with_role
from tests.organisations.support import headers_for, make_org

from .test_access import app_headers, entitled_org


async def test_lists_standing_for_app_and_account_sessions(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    user = await user_with_role(db_async, "gmsdash-member")
    entitled = await entitled_org(db_async, "Alpha entitled", user)
    pending = await make_org(
        db_async, "Beta waiting", members=((user, MembershipRole.OWNER),)
    )
    other = await user_with_role(db_async, "gmsdash-member")
    await make_org(db_async, "Not mine", members=((other, MembershipRole.OWNER),))
    created = await async_client.post(
        "/api/v1/models/access-requests",
        json={},
        headers=app_headers(user, pending.id),
    )
    assert created.status_code == 201

    for headers in (app_headers(user), headers_for(user)):
        response = await async_client.get(
            "/api/v1/models/organisations", headers=headers
        )
        assert response.status_code == 200, response.text
        assert [
            (o["id"], o["entitled"], o["request_status"]) for o in response.json()
        ] == [(entitled.id, True, None), (pending.id, False, "pending")]


async def test_other_apps_tokens_are_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    user = await user_with_role(db_async, "events-member")
    token = create_access_token(user.id, timedelta(minutes=5), app="events")
    response = await async_client.get(
        "/api/v1/models/organisations",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert response.status_code == 401
