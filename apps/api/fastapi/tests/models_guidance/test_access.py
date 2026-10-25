"""Meteogram access control and the organisation access-request flow."""

from datetime import timedelta

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.utils import create_access_token
from src.models_guidance import extract, service
from src.models_guidance.config import GuidancePoint, guidance_settings
from src.organisations import service as org_service
from src.organisations.models import MembershipRole
from tests.events.roles import user_with_role
from tests.organisations.support import headers_for, make_org

from .grib import write_grib
from .test_providers import RUN

POINT = GuidancePoint(key="mbia", name="MBIA", latitude=12.004, longitude=-61.786)
METEOGRAM = "/api/v1/models/meteogram"


@pytest.fixture(autouse=True)
def points(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(guidance_settings, "POINTS", [POINT])


def app_headers(user: User, organisation_id: str | None = None) -> dict[str, str]:
    token = create_access_token(
        user.id,
        timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app="gmsdash",
    )
    headers = {"Authorization": f"Bearer {token}"}
    if organisation_id:
        headers["X-Barrels-Organisation"] = organisation_id
    return headers


async def store_run(db: AsyncSession, tmp_path) -> None:
    path = write_grib(
        tmp_path / "r.grib2",
        [
            {"step": 0, "temp_k": 300.15, "gust": 8.0},
            {"step": 3, "temp_k": 301.15, "gust": 9.0, "accumulations": ((0, 0.002),)},
        ],
    )
    stored = await service.store_run(
        db,
        model="ifs",
        run_time=RUN,
        readings=extract.read_points(path, [POINT], "ifs"),
        points=[POINT],
    )
    assert stored is not None
    await db.commit()


async def entitled_org(db: AsyncSession, name: str, user: User):
    org = await make_org(db, name, members=((user, MembershipRole.ADMIN),))
    await org_service.set_app_enabled(
        db, organisation_id=org.id, app_key="gmsdash", enabled=True
    )
    await db.commit()
    return org


async def test_entitled_member_reads_the_meteogram_with_attribution(
    async_client: httpx.AsyncClient, db_async: AsyncSession, tmp_path
):
    await store_run(db_async, tmp_path)
    user = await user_with_role(db_async, "gmsdash-member")
    org = await entitled_org(db_async, "Airline", user)

    response = await async_client.get(
        METEOGRAM,
        params={"point": "mbia", "model": "ifs"},
        headers=app_headers(user, org.id),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["run_time"].startswith(RUN.isoformat())
    assert body["series"]["temperature_c"] == [27.0, 28.0]
    assert body["series"]["precipitation_mm"] == [None, 2.0]
    assert body["units"]["temperature_c"] == "degC"
    assert "CC-BY-4.0" in body["attribution"]
    assert body["disclaimer"] == "Raw model guidance, not an official GMS forecast."
    assert body["point"]["key"] == "mbia"


async def test_account_session_member_of_entitled_org_is_accepted(
    async_client: httpx.AsyncClient, db_async: AsyncSession, tmp_path
):
    await store_run(db_async, tmp_path)
    user = await user_with_role(db_async, None)
    org = await entitled_org(db_async, "Charter", user)
    response = await async_client.get(
        METEOGRAM,
        params={"point": "mbia", "model": "ifs"},
        headers=headers_for(user, org.id),
    )
    assert response.status_code == 200, response.text


async def test_organisation_without_the_entitlement_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession, tmp_path
):
    await store_run(db_async, tmp_path)
    user = await user_with_role(db_async, "gmsdash-member")
    org = await make_org(
        db_async, "Unentitled", members=((user, MembershipRole.OWNER),)
    )
    response = await async_client.get(
        METEOGRAM,
        params={"point": "mbia", "model": "ifs"},
        headers=app_headers(user, org.id),
    )
    assert response.status_code == 403
    assert "GMS Dashboard access" in response.json()["detail"]


async def test_disabled_entitlement_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession, tmp_path
):
    await store_run(db_async, tmp_path)
    user = await user_with_role(db_async, "gmsdash-member")
    org = await entitled_org(db_async, "Paused", user)
    await org_service.set_app_enabled(
        db_async, organisation_id=org.id, app_key="gmsdash", enabled=False
    )
    await db_async.commit()
    response = await async_client.get(
        METEOGRAM,
        params={"point": "mbia", "model": "ifs"},
        headers=app_headers(user, org.id),
    )
    assert response.status_code == 403


async def test_entitled_organisation_of_someone_else_is_hidden(
    async_client: httpx.AsyncClient, db_async: AsyncSession, tmp_path
):
    """A non-member cannot borrow another organisation's entitlement (404)."""
    await store_run(db_async, tmp_path)
    owner = await user_with_role(db_async, "gmsdash-member")
    org = await entitled_org(db_async, "Entitled", owner)
    outsider = await user_with_role(db_async, "gmsdash-member")
    response = await async_client.get(
        METEOGRAM,
        params={"point": "mbia", "model": "ifs"},
        headers=app_headers(outsider, org.id),
    )
    assert response.status_code == 404


async def test_other_apps_tokens_are_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession, tmp_path
):
    await store_run(db_async, tmp_path)
    user = await user_with_role(db_async, "events-member")
    org = await entitled_org(db_async, "Events org", user)
    token = create_access_token(user.id, timedelta(minutes=5), app="events")
    response = await async_client.get(
        METEOGRAM,
        params={"point": "mbia", "model": "ifs"},
        headers={"Authorization": f"Bearer {token}", "X-Barrels-Organisation": org.id},
    )
    assert response.status_code == 401


async def test_missing_credentials_and_header(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    params = {"point": "mbia", "model": "ifs"}
    assert (await async_client.get(METEOGRAM, params=params)).status_code == 401
    user = await user_with_role(db_async, "gmsdash-member")
    # No organisation header and no staff permission: not entitled.
    response = await async_client.get(
        METEOGRAM, params=params, headers=app_headers(user)
    )
    assert response.status_code == 403


async def test_staff_with_permission_reads_without_an_organisation(
    async_client: httpx.AsyncClient, db_async: AsyncSession, tmp_path
):
    await store_run(db_async, tmp_path)
    staff = await user_with_role(db_async, "gmsdash-operator")
    response = await async_client.get(
        METEOGRAM, params={"point": "mbia", "model": "ifs"}, headers=headers_for(staff)
    )
    assert response.status_code == 200, response.text

    plain = await user_with_role(db_async, None)
    denied = await async_client.get(
        METEOGRAM, params={"point": "mbia", "model": "ifs"}, headers=headers_for(plain)
    )
    assert denied.status_code == 403


async def test_unknown_point_and_missing_run(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    staff = await user_with_role(db_async, "gmsdash-operator")
    headers = headers_for(staff)
    unknown = await async_client.get(
        METEOGRAM, params={"point": "nowhere", "model": "ifs"}, headers=headers
    )
    assert unknown.status_code == 404
    no_run = await async_client.get(
        METEOGRAM, params={"point": "mbia", "model": "aifs"}, headers=headers
    )
    assert no_run.status_code == 404
    bad_model = await async_client.get(
        METEOGRAM, params={"point": "mbia", "model": "icon"}, headers=headers
    )
    assert bad_model.status_code == 422


async def test_catalogue_lists_points_and_latest_runs(
    async_client: httpx.AsyncClient, db_async: AsyncSession, tmp_path
):
    await store_run(db_async, tmp_path)
    staff = await user_with_role(db_async, "gmsdash-operator")
    response = await async_client.get(
        "/api/v1/models/catalogue", headers=headers_for(staff)
    )
    assert response.status_code == 200
    body = response.json()
    assert [p["key"] for p in body["points"]] == ["mbia"]
    latest = {m["key"]: m["latest_run_time"] for m in body["models"]}
    assert latest["ifs"].startswith(RUN.isoformat())
    assert latest["gfs"] is None


async def test_access_request_approval_unlocks_the_meteogram(
    async_client: httpx.AsyncClient, db_async: AsyncSession, tmp_path
):
    await store_run(db_async, tmp_path)
    admin = await user_with_role(db_async, "gmsdash-member")
    org = await make_org(
        db_async, "New client", members=((admin, MembershipRole.ADMIN),)
    )
    reviewer = await user_with_role(db_async, "gmsdash-operator")
    member_headers = app_headers(admin, org.id)

    status_before = await async_client.get(
        "/api/v1/models/access", headers=member_headers
    )
    assert status_before.json() == {"entitled": False, "request": None}

    created = await async_client.post(
        "/api/v1/models/access-requests",
        json={"note": "Dispatch planning"},
        headers=member_headers,
    )
    assert created.status_code == 201, created.text
    request_id = created.json()["id"]
    assert created.json()["status"] == "pending"

    duplicate = await async_client.post(
        "/api/v1/models/access-requests", json={}, headers=member_headers
    )
    assert duplicate.status_code == 409

    listing = await async_client.get(
        "/api/v1/models/access-requests",
        params={"status": "pending"},
        headers=headers_for(reviewer),
    )
    assert [r["id"] for r in listing.json()] == [request_id]
    assert listing.json()[0]["organisation_name"] == "New client"

    decided = await async_client.post(
        f"/api/v1/models/access-requests/{request_id}/decision",
        json={"decision": "approve", "note": "Welcome"},
        headers=headers_for(reviewer),
    )
    assert decided.status_code == 200, decided.text
    assert decided.json()["status"] == "approved"

    again = await async_client.post(
        f"/api/v1/models/access-requests/{request_id}/decision",
        json={"decision": "reject"},
        headers=headers_for(reviewer),
    )
    assert again.status_code == 409

    status_after = await async_client.get(
        "/api/v1/models/access", headers=member_headers
    )
    assert status_after.json()["entitled"] is True
    readable = await async_client.get(
        METEOGRAM, params={"point": "mbia", "model": "ifs"}, headers=member_headers
    )
    assert readable.status_code == 200
    already = await async_client.post(
        "/api/v1/models/access-requests", json={}, headers=member_headers
    )
    assert already.status_code == 409


async def test_rejection_keeps_access_closed_and_allows_a_new_request(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    admin = await user_with_role(db_async, "gmsdash-member")
    org = await make_org(db_async, "Maybe", members=((admin, MembershipRole.OWNER),))
    reviewer = await user_with_role(db_async, "gmsdash-operator")
    headers = app_headers(admin, org.id)
    request_id = (
        await async_client.post(
            "/api/v1/models/access-requests", json={}, headers=headers
        )
    ).json()["id"]
    rejected = await async_client.post(
        f"/api/v1/models/access-requests/{request_id}/decision",
        json={"decision": "reject", "note": "Not eligible"},
        headers=headers_for(reviewer),
    )
    assert rejected.json()["status"] == "rejected"
    assert (await async_client.get("/api/v1/models/access", headers=headers)).json()[
        "entitled"
    ] is False
    retry = await async_client.post(
        "/api/v1/models/access-requests", json={}, headers=headers
    )
    assert retry.status_code == 201


async def test_access_request_isolation_and_roles(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    member = await user_with_role(db_async, "gmsdash-member")
    org = await make_org(db_async, "Team", members=((member, MembershipRole.MEMBER),))
    # A plain member cannot ask on behalf of the organisation.
    low = await async_client.post(
        "/api/v1/models/access-requests", json={}, headers=app_headers(member, org.id)
    )
    assert low.status_code == 403
    # An outsider cannot see or create requests for it (404, no leak).
    outsider = await user_with_role(db_async, "gmsdash-member")
    other = await async_client.get(
        "/api/v1/models/access", headers=app_headers(outsider, org.id)
    )
    assert other.status_code == 404
    # Reviewing needs the staff permission.
    denied = await async_client.get(
        "/api/v1/models/access-requests", headers=headers_for(member)
    )
    assert denied.status_code == 403
    denied_decision = await async_client.post(
        "/api/v1/models/access-requests/00000000-0000-0000-0000-000000000000/decision",
        json={"decision": "approve"},
        headers=headers_for(member),
    )
    assert denied_decision.status_code == 403
    reviewer = await user_with_role(db_async, "gmsdash-operator")
    missing = await async_client.post(
        "/api/v1/models/access-requests/00000000-0000-0000-0000-000000000000/decision",
        json={"decision": "approve"},
        headers=headers_for(reviewer),
    )
    assert missing.status_code == 404
