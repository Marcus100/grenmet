"""Organisation routes that accept a member or an API key (ADR-0029, `org_or_key`)."""

import uuid
from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.organisations import service as org_service
from src.organisations.models import ApiKey, MembershipRole, PlatformOrganisation
from src.rewards import service as rewards_service
from src.rewards.schemas import ProgramCreate
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

KEYS = "/api/v1/organisations/org/api-keys"
SERVICES = "/api/v1/bookings/org/services"
LIST_BOOKINGS = (
    "/api/v1/bookings/org/bookings"
    "?starts_from=2027-01-01T00:00:00Z&ends_before=2027-02-01T00:00:00Z"
)


def _bearer(secret: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {secret}"}


async def _studio(
    db: AsyncSession,
) -> tuple[User, PlatformOrganisation, PlatformOrganisation]:
    """An admin of a bookings+rewards organisation, plus a second such organisation."""
    admin = await make_user(db)
    org = await make_org(
        db,
        f"Key Salon {uuid.uuid4().hex[:6]}",
        members=((admin, MembershipRole.ADMIN),),
        apps=("bookings", "rewards"),
    )
    other = await make_org(
        db,
        f"Other {uuid.uuid4().hex[:6]}",
        members=((admin, MembershipRole.ADMIN),),
        apps=("bookings", "rewards"),
    )
    return admin, org, other


async def _key(
    client: httpx.AsyncClient,
    admin: User,
    org: PlatformOrganisation,
    scopes: list[str],
) -> dict[str, Any]:
    resp = await client.post(
        KEYS,
        headers=headers_for(admin, org.id),
        json={"name": "Kiosk", "scopes": scopes},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_key_with_scope_reads_bookings(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org, _other = await _studio(db_async)
    key = await _key(async_client, admin, org, ["bookings.read"])
    created = await async_client.post(
        SERVICES,
        headers=headers_for(admin, org.id),
        json={"name": "Trim", "duration_min": 30, "price_minor": 1000},
    )
    assert created.status_code == 201, created.text

    resp = await async_client.get(LIST_BOOKINGS, headers=_bearer(key["secret"]))
    assert resp.status_code == 200, resp.text
    listed = await async_client.get(SERVICES, headers=_bearer(key["secret"]))
    assert listed.status_code == 200, listed.text
    assert [s["name"] for s in listed.json()] == ["Trim"]


async def test_key_without_scope_is_403(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org, _other = await _studio(db_async)
    rewards_only = await _key(async_client, admin, org, ["rewards.read"])
    resp = await async_client.get(SERVICES, headers=_bearer(rewards_only["secret"]))
    assert resp.status_code == 403
    confirm = await async_client.post(
        "/api/v1/rewards/redemptions/confirm",
        headers=_bearer(rewards_only["secret"]),
        json={"code": "ABCDEFGH"},
    )
    assert confirm.status_code == 403


async def test_key_sees_only_its_own_organisation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org, other = await _studio(db_async)
    await async_client.post(
        SERVICES,
        headers=headers_for(admin, other.id),
        json={"name": "Secret service", "duration_min": 30, "price_minor": 1},
    )
    key = await _key(async_client, admin, org, ["bookings.read"])
    # The organisation header cannot redirect a key to another organisation.
    headers = {**_bearer(key["secret"]), "X-Barrels-Organisation": other.id}
    resp = await async_client.get(SERVICES, headers=headers)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_revoked_expired_and_junk_keys_are_401(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org, _other = await _studio(db_async)
    revoked = await _key(async_client, admin, org, ["bookings.read"])
    expired = await _key(async_client, admin, org, ["bookings.read"])
    revoke = await async_client.post(
        f"{KEYS}/{revoked['id']}/revoke", headers=headers_for(admin, org.id)
    )
    assert revoke.status_code == 200, revoke.text
    row = await db_async.get(ApiKey, expired["id"])
    assert row is not None
    row.expires_at = utc_now() - timedelta(days=1)
    await db_async.commit()
    for secret in (revoked["secret"], expired["secret"], "bk_00000000_nope"):
        resp = await async_client.get(SERVICES, headers=_bearer(secret))
        assert resp.status_code == 401, secret
    assert (await async_client.get(SERVICES)).status_code == 401


async def test_entitlement_is_checked_for_keys(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org, _other = await _studio(db_async)
    key = await _key(async_client, admin, org, ["bookings.read"])
    await org_service.set_app_enabled(
        db_async, organisation_id=org.id, app_key="bookings", enabled=False
    )
    await db_async.commit()
    resp = await async_client.get(SERVICES, headers=_bearer(key["secret"]))
    assert resp.status_code == 403


async def test_member_path_keeps_its_error_order(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org, _other = await _studio(db_async)
    stranger = await make_user(db_async)
    assert (await async_client.get(SERVICES)).status_code == 401
    assert (
        await async_client.get(SERVICES, headers=headers_for(admin))
    ).status_code == 400
    assert (
        await async_client.get(SERVICES, headers=headers_for(stranger, org.id))
    ).status_code == 404
    assert (
        await async_client.get(SERVICES, headers=headers_for(admin, org.id))
    ).status_code == 200


async def test_key_reads_programmes_and_confirms_a_redemption(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org, other = await _studio(db_async)
    customer = await make_user(db_async)
    program = await rewards_service.create_program(
        db_async,
        organisation_id=org.id,
        actor=admin,
        payload=ProgramCreate(
            name="Coffee card", stamps_required=1, reward_description="A coffee"
        ),
    )
    await rewards_service.earn_for_source(
        db_async,
        account_id=customer.id,
        organisation_id=org.id,
        source_type="events.admission",
        source_id=f"a-{uuid.uuid4().hex[:6]}",
    )
    await db_async.commit()
    redeemed = await async_client.post(
        "/api/v1/rewards/me/redemptions",
        headers=headers_for(customer),
        json={"program_id": str(program.id)},
    )
    assert redeemed.status_code == 201, redeemed.text
    code = redeemed.json()["code"]

    reader = await _key(async_client, admin, org, ["rewards.read"])
    writer = await _key(async_client, admin, org, ["rewards.write"])
    other_writer = await _key(async_client, admin, other, ["rewards.write"])

    programs = await async_client.get(
        "/api/v1/rewards/programs", headers=_bearer(reader["secret"])
    )
    assert programs.status_code == 200
    assert [p["name"] for p in programs.json()] == ["Coffee card"]
    confirm = "/api/v1/rewards/redemptions/confirm"
    assert (
        await async_client.post(
            confirm, headers=_bearer(reader["secret"]), json={"code": code}
        )
    ).status_code == 403
    assert (
        await async_client.post(
            confirm, headers=_bearer(other_writer["secret"]), json={"code": code}
        )
    ).status_code == 404
    ok = await async_client.post(
        confirm, headers=_bearer(writer["secret"]), json={"code": code}
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["reward_description"] == "A coffee"
    again = await async_client.post(
        confirm, headers=_bearer(writer["secret"]), json={"code": code}
    )
    assert again.status_code == 409


def test_org_or_key_rejects_a_scope_of_another_product() -> None:
    from src.organisations.api_key_auth import org_or_key

    with pytest.raises(ValueError):
        org_or_key("bookings", "rewards.read")
    with pytest.raises(ValueError):
        org_or_key("bookings", "bookings.delete")
