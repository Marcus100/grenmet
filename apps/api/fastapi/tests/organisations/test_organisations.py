"""Platform organisations (F1): ids, slugs, memberships and GET /organisations/mine."""

import re

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AppException
from src.organisations import service
from src.organisations.models import (
    Membership,
    MembershipRole,
    MembershipStatus,
)
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org


async def test_new_organisation_gets_generated_id_and_editable_slug(
    db_async: AsyncSession,
):
    first = await service.create_organisation(db_async, name="Spice Isle Tours")
    second = await service.create_organisation(db_async, name="Spice Isle Tours")
    assert re.fullmatch(r"org_[0-9a-f]{16}", first.id)
    assert first.id != second.id
    assert first.slug == "spice-isle-tours"
    assert second.slug == "spice-isle-tours-2"
    assert first.kind == "business"
    assert first.status == "active"


async def test_blank_name_is_rejected(db_async: AsyncSession):
    with pytest.raises(AppException):
        await service.create_organisation(db_async, name="   ")


async def test_membership_is_unique_per_user_and_organisation(db_async: AsyncSession):
    user = await make_user(db_async)
    org = await make_org(db_async, "Dup Co", members=((user, MembershipRole.OWNER),))
    with pytest.raises(IntegrityError):
        await service.add_member(
            db_async,
            organisation_id=org.id,
            user_id=user.id,
            role=MembershipRole.MEMBER,
        )
    await db_async.rollback()


async def test_invalid_role_is_rejected_by_the_database(db_async: AsyncSession):
    user = await make_user(db_async)
    org = await make_org(db_async, "Check Co")
    db_async.add(
        Membership(
            id="mem_bad",
            organisation_id=org.id,
            user_id=user.id,
            role="emperor",
            status="active",
        )
    )
    with pytest.raises(IntegrityError):
        await db_async.flush()
    await db_async.rollback()


async def test_app_entitlement_requires_a_registered_app(db_async: AsyncSession):
    org = await make_org(db_async, "Apps Co")
    row = await service.set_app_enabled(
        db_async, organisation_id=org.id, app_key="events", enabled=True
    )
    assert row.enabled is True
    row = await service.set_app_enabled(
        db_async, organisation_id=org.id, app_key="events", enabled=False
    )
    assert row.enabled is False
    with pytest.raises(AppException):
        await service.set_app_enabled(
            db_async, organisation_id=org.id, app_key="nope", enabled=True
        )
    await db_async.rollback()


async def test_mine_lists_only_my_active_memberships(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    me = await make_user(db_async)
    other = await make_user(db_async)
    zeta = await make_org(db_async, "Zeta Ltd", members=((me, MembershipRole.ADMIN),))
    alpha = await make_org(db_async, "Alpha Ltd", members=((me, MembershipRole.OWNER),))
    await make_org(db_async, "Not Mine", members=((other, MembershipRole.OWNER),))
    removed = await make_org(db_async, "Gone Ltd")
    await service.add_member(
        db_async,
        organisation_id=removed.id,
        user_id=me.id,
        role=MembershipRole.MEMBER,
        status=MembershipStatus.REMOVED,
    )
    invited = await make_org(db_async, "Invited Ltd")
    await service.add_member(
        db_async,
        organisation_id=invited.id,
        user_id=me.id,
        role=MembershipRole.MEMBER,
        status=MembershipStatus.INVITED,
    )
    await db_async.commit()

    response = await async_client.get(
        "/api/v1/organisations/mine", headers=headers_for(me)
    )
    assert response.status_code == 200
    body = response.json()
    assert [row["organisation"]["id"] for row in body] == [alpha.id, zeta.id]
    assert [row["role"] for row in body] == ["owner", "admin"]
    assert body[0]["status"] == "active"
    assert body[0]["organisation"] == {
        "id": alpha.id,
        "slug": "alpha-ltd",
        "name": "Alpha Ltd",
        "kind": "business",
        "status": "active",
        "verified_at": None,
    }
    assert set(body[0]) == {
        "membership_id",
        "role",
        "status",
        "joined_at",
        "organisation",
    }


async def test_mine_is_empty_without_memberships_and_needs_sign_in(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    user = await make_user(db_async)
    response = await async_client.get(
        "/api/v1/organisations/mine", headers=headers_for(user)
    )
    assert response.status_code == 200
    assert response.json() == []
    assert (await async_client.get("/api/v1/organisations/mine")).status_code == 401


async def test_deleting_an_organisation_removes_its_memberships(
    db_async: AsyncSession,
):
    user = await make_user(db_async)
    org = await make_org(
        db_async, "Cascade Co", members=((user, MembershipRole.OWNER),)
    )
    org_id = org.id
    await db_async.delete(org)
    await db_async.commit()
    rows = await db_async.scalars(
        select(Membership).where(Membership.organisation_id == org_id)
    )
    assert list(rows) == []
