"""OrgContext (F3): header contract, membership isolation, roles and log binding."""

import logging
from typing import Any

import httpx
import pytest
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AppException, app_exception_handler
from src.organisations import service
from src.organisations.dependencies import OrgAdmin, OrgMember, OrgOwner
from src.organisations.models import (
    MembershipRole,
    MembershipStatus,
    OrganisationStatus,
)
from src.request_context import (
    RequestIdFilter,
    bind_organisation_id,
    current_organisation_id,
    reset_organisation_id,
)
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org


def _probe_app() -> FastAPI:
    """A tiny app whose routes sit behind each OrgContext alias."""
    probe = FastAPI()

    async def handle(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, AppException)
        return await app_exception_handler(request, exc)

    probe.add_exception_handler(AppException, handle)

    @probe.get("/member")
    async def member(context: OrgMember) -> dict[str, Any]:
        return {
            "organisation_id": context.organisation_id,
            "role": context.role.value,
            "logged_organisation_id": current_organisation_id(),
        }

    @probe.get("/admin")
    async def admin(context: OrgAdmin) -> dict[str, str]:
        return {"organisation_id": context.organisation_id}

    @probe.get("/owner")
    async def owner(context: OrgOwner) -> dict[str, str]:
        return {"organisation_id": context.organisation_id}

    return probe


@pytest.fixture
async def probe(test_database: None) -> Any:
    assert test_database is None
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_probe_app()), base_url="http://probe"
    ) as client:
        yield client


async def test_member_resolves_the_header_organisation(
    probe: httpx.AsyncClient, db_async: AsyncSession
):
    user = await make_user(db_async)
    org = await make_org(db_async, "Alpha", members=((user, MembershipRole.MEMBER),))
    response = await probe.get("/member", headers=headers_for(user, org.id))
    assert response.status_code == 200
    assert response.json() == {
        "organisation_id": org.id,
        "role": "member",
        "logged_organisation_id": org.id,
    }
    assert current_organisation_id() is None


async def test_member_of_a_is_denied_on_b_without_revealing_b(
    probe: httpx.AsyncClient, db_async: AsyncSession
):
    user = await make_user(db_async)
    org_a = await make_org(db_async, "A", members=((user, MembershipRole.OWNER),))
    org_b = await make_org(db_async, "B", members=())
    assert (
        await probe.get("/member", headers=headers_for(user, org_a.id))
    ).status_code == 200
    denied = await probe.get("/member", headers=headers_for(user, org_b.id))
    unknown = await probe.get("/member", headers=headers_for(user, "org_doesnotexist"))
    assert denied.status_code == 404
    assert unknown.status_code == 404
    assert denied.json() == unknown.json() == {"detail": "Organisation not found"}


async def test_other_organisations_members_are_not_members_here(
    probe: httpx.AsyncClient, db_async: AsyncSession
):
    owner_a = await make_user(db_async)
    owner_b = await make_user(db_async)
    org_a = await make_org(db_async, "A", members=((owner_a, MembershipRole.OWNER),))
    org_b = await make_org(db_async, "B", members=((owner_b, MembershipRole.OWNER),))
    for caller, target in ((owner_a, org_b), (owner_b, org_a)):
        response = await probe.get("/owner", headers=headers_for(caller, target.id))
        assert response.status_code == 404


async def test_superuser_has_no_membership_bypass(
    probe: httpx.AsyncClient, db_async: AsyncSession
):
    superuser = await make_user(db_async, superuser=True)
    org = await make_org(db_async, "Sealed")
    response = await probe.get("/member", headers=headers_for(superuser, org.id))
    assert response.status_code == 404


async def test_header_is_required(probe: httpx.AsyncClient, db_async: AsyncSession):
    user = await make_user(db_async)
    for headers in (
        headers_for(user),
        {**headers_for(user), "X-Barrels-Organisation": "   "},
    ):
        response = await probe.get("/member", headers=headers)
        assert response.status_code == 400
        assert "X-Barrels-Organisation" in response.json()["detail"]


async def test_overlong_header_is_not_found_not_an_error(
    probe: httpx.AsyncClient, db_async: AsyncSession
):
    user = await make_user(db_async)
    response = await probe.get("/member", headers=headers_for(user, "o" * 500))
    assert response.status_code == 404


async def test_sign_in_is_still_required(probe: httpx.AsyncClient):
    response = await probe.get("/member", headers={"X-Barrels-Organisation": "gaa"})
    assert response.status_code == 401


@pytest.mark.parametrize(
    ("role", "member_ok", "admin_ok", "owner_ok"),
    [
        (MembershipRole.MEMBER, True, False, False),
        (MembershipRole.ADMIN, True, True, False),
        (MembershipRole.OWNER, True, True, True),
    ],
)
async def test_role_hierarchy(
    probe: httpx.AsyncClient,
    db_async: AsyncSession,
    role: MembershipRole,
    member_ok: bool,
    admin_ok: bool,
    owner_ok: bool,
):
    user = await make_user(db_async)
    org = await make_org(db_async, "Roles", members=((user, role),))
    headers = headers_for(user, org.id)
    expected = {"/member": member_ok, "/admin": admin_ok, "/owner": owner_ok}
    for path, allowed in expected.items():
        response = await probe.get(path, headers=headers)
        assert response.status_code == (200 if allowed else 403), path


async def test_removed_and_invited_members_are_not_members(
    probe: httpx.AsyncClient, db_async: AsyncSession
):
    user = await make_user(db_async)
    org = await make_org(db_async, "Gate")
    membership = await service.add_member(
        db_async,
        organisation_id=org.id,
        user_id=user.id,
        role=MembershipRole.OWNER,
        status=MembershipStatus.INVITED,
    )
    await db_async.commit()
    headers = headers_for(user, org.id)
    assert (await probe.get("/member", headers=headers)).status_code == 404
    membership.status = MembershipStatus.REMOVED.value
    await db_async.commit()
    assert (await probe.get("/member", headers=headers)).status_code == 404


async def test_suspended_organisation_is_forbidden_to_its_members(
    probe: httpx.AsyncClient, db_async: AsyncSession
):
    user = await make_user(db_async)
    org = await make_org(db_async, "Paused", members=((user, MembershipRole.OWNER),))
    org.status = OrganisationStatus.SUSPENDED.value
    await db_async.commit()
    response = await probe.get("/member", headers=headers_for(user, org.id))
    assert response.status_code == 403


async def test_current_organisation_route(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    user = await make_user(db_async)
    org = await make_org(
        db_async, "Current Co", members=((user, MembershipRole.ADMIN),)
    )
    other = await make_org(db_async, "Elsewhere")
    ok = await async_client.get(
        "/api/v1/organisations/current", headers=headers_for(user, org.id)
    )
    assert ok.status_code == 200
    assert ok.json()["role"] == "admin"
    assert ok.json()["organisation"]["id"] == org.id
    assert (
        await async_client.get(
            "/api/v1/organisations/current", headers=headers_for(user, other.id)
        )
    ).status_code == 404
    assert (
        await async_client.get(
            "/api/v1/organisations/current", headers=headers_for(user)
        )
    ).status_code == 400


def test_organisation_id_reaches_log_records():
    record = logging.LogRecord("t", logging.INFO, __file__, 1, "msg", None, None)
    token = bind_organisation_id("org_logged")
    try:
        RequestIdFilter().filter(record)
        assert record.__dict__["organisation_id"] == "org_logged"
    finally:
        reset_organisation_id(token)
    record = logging.LogRecord("t", logging.INFO, __file__, 1, "msg", None, None)
    RequestIdFilter().filter(record)
    assert record.__dict__["organisation_id"] == "-"
