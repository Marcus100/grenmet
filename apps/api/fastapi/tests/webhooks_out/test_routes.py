"""Endpoint management routes: secrets, isolation, entitlement, test ping, admin."""

import httpx
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.organisations.models import MembershipRole
from src.utils.signing import verify_timestamped
from src.webhooks_out import service
from src.webhooks_out.models import WebhookEndpoint
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org
from tests.webhooks_out.support import RECEIVER, URL, Receiver, Resolver, setup_org


async def _create(client: httpx.AsyncClient, admin, org, **extra) -> httpx.Response:
    return await client.post(
        f"{URL}/org/endpoints",
        headers=headers_for(admin, org.id),
        json={"url": RECEIVER, "event_types": ["booking.created"], **extra},
    )


async def test_secret_is_shown_once_stored_encrypted_and_never_listed(
    async_client: httpx.AsyncClient, db_async: AsyncSession, resolver: Resolver
) -> None:
    _ = resolver
    admin, org = await setup_org(db_async)
    response = await _create(async_client, admin, org, description="Prod")
    assert response.status_code == 201, response.text
    body = response.json()
    secret = body["secret"]
    assert secret.startswith("whsec_")
    assert body["status"] == "active"
    assert body["event_types"] == ["booking.created"]

    row = await db_async.get(WebhookEndpoint, body["id"])
    assert row is not None
    assert secret not in row.secret_encrypted
    assert row.secret_encrypted.startswith("fernet:v1:")
    assert service.decrypt_secret(row) == secret

    headers = headers_for(admin, org.id)
    listed = await async_client.get(f"{URL}/org/endpoints", headers=headers)
    assert listed.status_code == 200
    assert secret not in listed.text
    assert "secret" not in listed.json()["data"][0]
    patched = await async_client.patch(
        f"{URL}/org/endpoints/{body['id']}", headers=headers, json={"description": "x"}
    )
    assert "secret" not in patched.json()

    # Audit history keeps the fields but not the secret or the failure counter.
    entries = (
        await db_async.scalars(
            select(AuditEntry).where(AuditEntry.record_type == "webhook_endpoint")
        )
    ).all()
    assert entries
    fields = {change["field"] for e in entries for change in e.changes}
    assert "url" in fields
    assert not fields & {"secret_encrypted", "consecutive_failures"}
    assert secret not in str([e.changes for e in entries])


async def test_rotate_issues_a_new_secret_and_signs_with_it(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    receiver: Receiver,
) -> None:
    admin, org = await setup_org(db_async)
    created = (await _create(async_client, admin, org)).json()
    headers = headers_for(admin, org.id)
    rotated = await async_client.post(
        f"{URL}/org/endpoints/{created['id']}/rotate-secret", headers=headers
    )
    assert rotated.status_code == 200, rotated.text
    new_secret = rotated.json()["secret"]
    assert new_secret != created["secret"]

    ping = await async_client.post(
        f"{URL}/org/endpoints/{created['id']}/test", headers=headers
    )
    assert ping.status_code == 200
    assert ping.json()["delivered"] is True
    assert ping.json()["response_status"] == 200
    request = receiver.requests[-1]
    header = request.headers["Barrels-Signature"]
    assert verify_timestamped(new_secret, request.content, header)
    assert not verify_timestamped(created["secret"], request.content, header)
    assert request.headers["Barrels-Event-Type"] == "ping"


async def test_ping_reports_failures_without_counting_them(
    async_client: httpx.AsyncClient, db_async: AsyncSession, receiver: Receiver
) -> None:
    admin, org = await setup_org(db_async)
    created = (await _create(async_client, admin, org)).json()
    receiver.handler = lambda _: httpx.Response(502)
    result = await async_client.post(
        f"{URL}/org/endpoints/{created['id']}/test",
        headers=headers_for(admin, org.id),
    )
    assert result.json()["delivered"] is False
    assert result.json()["response_status"] == 502
    row = await db_async.get(WebhookEndpoint, created["id"])
    await db_async.refresh(row)
    assert row is not None and row.consecutive_failures == 0


async def test_registration_rejects_unsafe_urls_and_event_types(
    async_client: httpx.AsyncClient, db_async: AsyncSession, resolver: Resolver
) -> None:
    admin, org = await setup_org(db_async)
    for url in (
        "http://hooks.example.com/h",
        "https://localhost/h",
        "https://x@a.com/h",
    ):
        response = await _create(async_client, admin, org, url=url)
        assert response.status_code == 422, url
    for address in ("10.0.0.5", "127.0.0.1", "169.254.169.254", "::1"):
        resolver.answers["private.example.com"] = [address]
        response = await _create(
            async_client, admin, org, url="https://private.example.com/h"
        )
        assert response.status_code == 422, address
        assert "non-public" in response.json()["detail"]
    bad = await _create(async_client, admin, org, event_types=["booking.exploded"])
    assert bad.status_code == 422
    empty = await _create(async_client, admin, org, event_types=[])
    assert empty.status_code == 422


async def test_update_reenables_and_revalidates(
    async_client: httpx.AsyncClient, db_async: AsyncSession, resolver: Resolver
) -> None:
    admin, org = await setup_org(db_async)
    created = (await _create(async_client, admin, org)).json()
    row = await db_async.get(WebhookEndpoint, created["id"])
    assert row is not None
    row.status = "disabled"
    row.consecutive_failures = 15
    row.disabled_reason = "too many"
    await db_async.commit()
    headers = headers_for(admin, org.id)

    resolver.answers["hooks.example.com"] = ["10.0.0.1"]
    refused = await async_client.patch(
        f"{URL}/org/endpoints/{created['id']}",
        headers=headers,
        json={"status": "active"},
    )
    assert refused.status_code == 422
    resolver.answers.clear()
    ok = await async_client.patch(
        f"{URL}/org/endpoints/{created['id']}",
        headers=headers,
        json={"status": "active", "event_types": ["*", "payment.succeeded"]},
    )
    assert ok.status_code == 200, ok.text
    body = ok.json()
    assert (body["status"], body["consecutive_failures"], body["disabled_reason"]) == (
        "active",
        0,
        None,
    )
    assert body["event_types"] == ["*"]


async def test_deliveries_list_is_paginated_and_delete_cascades(
    async_client: httpx.AsyncClient, db_async: AsyncSession, receiver: Receiver
) -> None:
    _ = receiver
    admin, org = await setup_org(db_async)
    created = (await _create(async_client, admin, org)).json()
    for index in range(3):
        await service.emit_event(
            db_async,
            org.id,
            "booking.created",
            {"booking_id": f"bk_{index}", "status": "confirmed"},
        )
    await db_async.commit()
    headers = headers_for(admin, org.id)
    page = await async_client.get(
        f"{URL}/org/endpoints/{created['id']}/deliveries",
        headers=headers,
        params={"size": 2},
    )
    assert page.status_code == 200
    body = page.json()
    assert (body["count"], len(body["data"]), body["size"]) == (3, 2, 2)
    assert set(body["data"][0]) >= {"status", "attempts", "event_type", "last_error"}
    assert "payload" not in body["data"][0]
    deleted = await async_client.delete(
        f"{URL}/org/endpoints/{created['id']}", headers=headers
    )
    assert deleted.status_code == 204
    remaining = await db_async.scalar(
        text("SELECT count(*) FROM webhooks.delivery WHERE endpoint_id = :i"),
        {"i": created["id"]},
    )
    assert remaining == 0


async def test_event_types_are_listed_with_schemas(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await setup_org(db_async)
    response = await async_client.get(
        f"{URL}/org/event-types", headers=headers_for(admin, org.id)
    )
    assert response.status_code == 200
    keys = {row["key"] for row in response.json()["data"]}
    assert keys == {
        "booking.created",
        "booking.cancelled",
        "booking.rescheduled",
        "payment.succeeded",
        "payment.refunded",
        "contact.erased",
    }
    assert "properties" in response.json()["data"][0]["data_schema"]


async def test_other_organisations_cannot_see_or_change_an_endpoint(
    async_client: httpx.AsyncClient, db_async: AsyncSession, receiver: Receiver
) -> None:
    _ = receiver
    admin, org = await setup_org(db_async)
    other_admin, other_org = await setup_org(db_async, "Rival Co")
    created = (await _create(async_client, admin, org)).json()
    rival = headers_for(other_admin, other_org.id)
    path = f"{URL}/org/endpoints/{created['id']}"
    for method, suffix in (
        ("PATCH", ""),
        ("DELETE", ""),
        ("POST", "/rotate-secret"),
        ("POST", "/test"),
        ("GET", "/deliveries"),
    ):
        response = await async_client.request(
            method, path + suffix, headers=rival, json={} if method == "PATCH" else None
        )
        assert response.status_code == 404, (method, suffix)
    listed = await async_client.get(f"{URL}/org/endpoints", headers=rival)
    assert listed.json()["count"] == 0
    # Naming the first organisation in the header is a non-member 404 too.
    forged = await async_client.get(
        f"{URL}/org/endpoints", headers=headers_for(other_admin, org.id)
    )
    assert forged.status_code == 404
    assert receiver.requests == []


async def test_entitlement_and_role_are_required(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, plain = await setup_org(db_async, "Plain Co", apps=())
    response = await async_client.get(
        f"{URL}/org/endpoints", headers=headers_for(admin, plain.id)
    )
    assert response.status_code == 403
    assert (await _create(async_client, admin, plain)).status_code == 403

    member = await make_user(db_async)
    org = await make_org(
        db_async,
        "Staffed Co",
        members=((member, MembershipRole.MEMBER),),
        apps=("webhooks",),
    )
    assert (
        await async_client.get(
            f"{URL}/org/endpoints", headers=headers_for(member, org.id)
        )
    ).status_code == 403
    assert (await async_client.get(f"{URL}/org/endpoints")).status_code == 401


async def test_endpoint_limit(
    async_client: httpx.AsyncClient, db_async: AsyncSession, resolver: Resolver
) -> None:
    _ = resolver
    admin, org = await setup_org(db_async)
    for index in range(service.MAX_ENDPOINTS_PER_ORGANISATION):
        response = await _create(
            async_client, admin, org, url=f"https://h{index}.example.com/h"
        )
        assert response.status_code == 201
    assert (await _create(async_client, admin, org)).status_code == 409


async def test_admin_routes_are_superuser_only(
    async_client: httpx.AsyncClient, db_async: AsyncSession, resolver: Resolver
) -> None:
    _ = resolver
    admin, org = await setup_org(db_async)
    _other_admin, other = await setup_org(db_async, "Other Co")
    created = (await _create(async_client, admin, org)).json()
    await _create(async_client, _other_admin, other)
    root = await make_user(db_async, superuser=True)

    assert (
        await async_client.get(f"{URL}/admin/endpoints", headers=headers_for(admin))
    ).status_code == 403
    assert (
        await async_client.post(
            f"{URL}/admin/endpoints/{created['id']}/disable",
            headers=headers_for(admin),
            json={"reason": "x"},
        )
    ).status_code == 403

    everything = await async_client.get(
        f"{URL}/admin/endpoints", headers=headers_for(root)
    )
    assert everything.json()["count"] == 2
    filtered = await async_client.get(
        f"{URL}/admin/endpoints",
        headers=headers_for(root),
        params={"organisation_id": org.id},
    )
    assert [row["id"] for row in filtered.json()["data"]] == [created["id"]]
    assert "secret" not in filtered.text

    disabled = await async_client.post(
        f"{URL}/admin/endpoints/{created['id']}/disable",
        headers=headers_for(root),
        json={"reason": "abuse report"},
    )
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["status"] == "disabled"
    assert "abuse report" in disabled.json()["disabled_reason"]
    row = await db_async.get(WebhookEndpoint, created["id"])
    await db_async.refresh(row)
    assert row is not None and row.status == "disabled"
