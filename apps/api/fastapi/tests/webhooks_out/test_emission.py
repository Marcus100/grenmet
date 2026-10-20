"""Domain actions queue webhook deliveries; the events carry no personal data."""

import json
import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contacts import service as contacts_service
from src.organisations import service as organisation_service
from src.outbox import Outbox
from src.webhooks_out import service
from src.webhooks_out.models import WebhookEndpoint
from src.webhooks_out.schemas import WebhookEndpointCreate
from tests.bookings.test_public_bookings import _book, _slots, _studio
from tests.factories import make_user
from tests.payments.test_payments import _org as _payments_org
from tests.payments.test_payments import _paid
from tests.webhooks_out.support import RECEIVER, Resolver


@pytest.fixture(autouse=True)
def _public_dns(resolver: Resolver) -> None:
    """Endpoint registration resolves the host; answer with a public address."""
    _ = resolver


PAYMENTS = "/api/v1/payments"
BOOKINGS = "/api/v1/bookings"


async def _subscribe(db: AsyncSession, organisation_id: str, *events: str) -> None:
    await organisation_service.set_app_enabled(
        db, organisation_id=organisation_id, app_key="webhooks", enabled=True
    )
    actor = await make_user(db, superuser=True)
    await service.create_endpoint(
        db,
        actor,
        organisation_id=organisation_id,
        payload=WebhookEndpointCreate(url=RECEIVER, event_types=list(events) or ["*"]),
    )
    await db.commit()


async def _events(db: AsyncSession, organisation_id: str) -> list[dict]:
    rows = await db.scalars(
        select(Outbox)
        .where(
            Outbox.organisation_id == organisation_id,
            Outbox.topic == service.DELIVER_TOPIC,
        )
        .order_by(Outbox.dedupe_key)
        .execution_options(populate_existing=True)
    )
    return [row.payload for row in rows]


def _types(payloads: list[dict]) -> list[str]:
    return sorted(json.dumps(payload) for payload in payloads)


async def test_booking_lifecycle_queues_events_without_personal_data(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, apps=("bookings", "webhooks"))
    await _subscribe(db_async, studio.org_id, "booking.created", "booking.cancelled")
    slots = await _slots(async_client, studio)
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"
    created = await _book(async_client, studio, slots[0], customer_email=email)
    assert created.status_code == 201, created.text
    token = created.json()["manage_token"]

    payloads = await _events(db_async, studio.org_id)
    blob = json.dumps(payloads)
    assert len(payloads) == 1
    assert "booking.created" in blob
    # Identifiers, status and times only.
    for private in (email, "Ada Lovelace", "555 0100", token):
        assert private not in blob

    cancel = await async_client.post(f"{BOOKINGS}/public/bookings/{token}/cancel")
    assert cancel.status_code == 200, cancel.text
    after = json.dumps(await _events(db_async, studio.org_id))
    assert "booking.cancelled" in after

    # A repeated cancel is a no-op and queues nothing new.
    again = await async_client.post(f"{BOOKINGS}/public/bookings/{token}/cancel")
    assert again.status_code == 200
    assert len(await _events(db_async, studio.org_id)) == 2


async def test_reschedule_queues_an_event_with_the_previous_time(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, apps=("bookings", "webhooks"))
    await _subscribe(db_async, studio.org_id, "booking.rescheduled")
    slots = await _slots(async_client, studio)
    created = await _book(async_client, studio, slots[0])
    token = created.json()["manage_token"]
    moved = await async_client.post(
        f"{BOOKINGS}/public/bookings/{token}/reschedule",
        json={"starts_at": slots[-1]},
    )
    assert moved.status_code == 200, moved.text
    payloads = await _events(db_async, studio.org_id)
    assert len(payloads) == 1
    blob = json.dumps(payloads[0])
    assert "booking.rescheduled" in blob
    assert "previous_starts_at" in blob


async def test_organisations_without_the_entitlement_queue_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)  # no webhooks entitlement
    assert (
        await _book(async_client, studio, (await _slots(async_client, studio))[0])
    ).status_code == 201
    assert await _events(db_async, studio.org_id) == []
    assert (
        await db_async.scalar(
            select(WebhookEndpoint.id).where(
                WebhookEndpoint.organisation_id == studio.org_id
            )
        )
        is None
    )


async def test_payments_queue_succeeded_and_refunded_events(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    org, admin = await _payments_org(db_async, apps=("payments", "webhooks"))
    await _subscribe(db_async, org.id, "payment.succeeded", "payment.refunded")
    from tests.organisations.support import headers_for

    intent_id = await _paid(async_client, org, admin)
    blob = json.dumps(await _events(db_async, org.id))
    assert "payment.succeeded" in blob
    assert intent_id in blob

    refund = await async_client.post(
        f"{PAYMENTS}/org/intents/{intent_id}/refunds",
        headers=headers_for(admin, org.id),
        json={"amount_minor": 1000, "reason": "Short stay"},
    )
    assert refund.status_code == 201, refund.text
    after = json.dumps(await _events(db_async, org.id))
    assert "payment.refunded" in after
    assert "Short stay" not in after  # the reason is free text: never sent


async def test_contact_erasure_queues_an_event_without_the_address(
    db_async: AsyncSession,
) -> None:
    org, _ = await _payments_org(db_async, apps=("contacts", "webhooks"))
    await _subscribe(db_async, org.id, "contact.erased")
    email = f"pat-{uuid.uuid4().hex[:8]}@example.com"
    contact = await contacts_service.upsert_contact(
        db_async, org.id, email=email, name="Pat Doe", source="manual"
    )
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()

    payloads = await _events(db_async, org.id)
    blob = json.dumps(payloads)
    assert len(payloads) == 1
    assert "contact.erased" in blob
    assert email not in blob
    assert "Pat Doe" not in blob


async def test_a_broken_webhook_never_fails_the_action(
    db_async: AsyncSession, async_client: httpx.AsyncClient, monkeypatch
) -> None:
    studio = await _studio(db_async, async_client, apps=("bookings", "webhooks"))
    await _subscribe(db_async, studio.org_id, "booking.created")

    async def boom(*_args, **_kwargs):
        raise ValueError("bad payload")

    monkeypatch.setattr(service, "emit_event", boom)
    slots = await _slots(async_client, studio)
    created = await _book(async_client, studio, slots[0])
    assert created.status_code == 201, created.text
    assert await _events(db_async, studio.org_id) == []


def test_long_producer_event_ids_are_shortened_stably() -> None:
    long_id = f"booking.rescheduled:{uuid.uuid4()}:20270104T1930"
    assert len(long_id) > service.EVENT_ID_MAX
    shortened = service.stable_event_id(long_id)
    assert len(shortened) <= service.EVENT_ID_MAX
    assert shortened == service.stable_event_id(long_id)  # a repeat still dedupes
    assert shortened != service.stable_event_id(long_id + "x")
    assert service.stable_event_id("booking.created:abc") == "booking.created:abc"
