"""Bookings: staff record a deposit taken outside Stripe."""

import uuid

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import Role
from src.auth.permissions import seed_permissions_and_roles_async
from src.bookings.models import Booking
from src.organisations import service as org_service
from src.organisations.models import Membership, MembershipRole
from src.payments.models import Intent, LedgerEntry, LedgerKind
from tests.bookings.test_app_token_access import _headers as app_headers
from tests.bookings.test_deposits import (
    DEPOSIT,
    _book_deposit,
    _deposit_studio,
    _drain,
    _events,
    _intent,
    _pay_manually,
)
from tests.bookings.test_public_bookings import API, Studio, _booking_for
from tests.factories import assign_role, make_user
from tests.organisations.support import headers_for


def _url(booking_id: str) -> str:
    return f"{API}/org/bookings/{booking_id}/manual-deposit"


async def _post(
    client: httpx.AsyncClient,
    studio: Studio,
    booking_id: str,
    *,
    key: str | None = None,
    headers: dict[str, str] | None = None,
    body: dict | None = None,
) -> httpx.Response:
    return await client.post(
        _url(booking_id),
        headers={
            **(headers or studio.headers),
            "Idempotency-Key": key or uuid.uuid4().hex,
        },
        json=body or {"method": "cash", "reference": "R-9"},
    )


async def _unpaid(db: AsyncSession, client: httpx.AsyncClient) -> tuple[Studio, str]:
    studio = await _deposit_studio(db, client)
    receipt = await _book_deposit(client, studio, db=db)
    return studio, receipt["booking"]["id"]


async def _charges(db: AsyncSession, booking_id: str) -> int:
    intent = await _intent(db, booking_id)
    assert intent is not None
    return int(
        await db.scalar(
            select(func.count())
            .select_from(LedgerEntry)
            .where(
                LedgerEntry.intent_id == intent.id,
                LedgerEntry.kind == LedgerKind.CHARGE.value,
            )
        )
        or 0
    )


async def test_recording_a_deposit_marks_it_paid_and_confirms_the_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    response = await _post(async_client, studio, booking_id)
    assert response.status_code == 200, response.text
    assert response.json()["deposit_captured_minor"] == DEPOSIT
    assert response.json()["deposit_refunded_minor"] == 0

    await _drain(db_async)
    assert (await _booking_for(db_async, booking_id)).status == "confirmed"
    detail = await async_client.get(
        f"{API}/org/bookings/{booking_id}", headers=studio.headers
    )
    assert detail.json()["deposit_captured_minor"] == DEPOSIT
    notes = [e.note for e in await _events(db_async, booking_id)]
    assert "Deposit recorded by hand (cash)" in notes


async def test_the_audit_log_names_the_actor(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    assert (await _post(async_client, studio, booking_id)).status_code == 200
    entry = await db_async.scalar(
        select(AuditEntry)
        .where(AuditEntry.entity_type == "booking", AuditEntry.entity_id == booking_id)
        .execution_options(populate_existing=True)
    )
    assert entry is not None
    assert entry.action == "manual_deposit"
    assert entry.actor_user_id is not None
    assert entry.organisation_id == studio.org_id
    fields = {c["field"]: c["new"] for c in entry.changes}
    assert fields["deposit_captured_minor"] == DEPOSIT
    assert fields["method"] == "cash"


async def test_the_same_key_replays_and_records_one_charge(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    first = await _post(async_client, studio, booking_id, key="k-1")
    again = await _post(async_client, studio, booking_id, key="k-1")
    assert first.status_code == again.status_code == 200
    assert again.headers["Idempotency-Replayed"] == "true"
    assert again.json() == first.json()
    assert await _charges(db_async, booking_id) == 1

    other = await _post(
        async_client, studio, booking_id, key="k-1", body={"method": "cheque"}
    )
    assert other.status_code == 409


async def test_a_new_key_after_capture_is_rejected(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    assert (await _post(async_client, studio, booking_id)).status_code == 200
    second = await _post(async_client, studio, booking_id)
    assert second.status_code == 409
    assert "already" in second.json()["detail"].lower()
    assert await _charges(db_async, booking_id) == 1


async def test_a_deposit_paid_through_payments_is_rejected(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    await _pay_manually(async_client, studio, intent.id)
    assert (await _post(async_client, studio, booking_id)).status_code == 409
    assert await _charges(db_async, booking_id) == 1


async def test_a_booking_without_a_deposit_is_rejected(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    from tests.bookings.test_public_bookings import _book, _slots, _studio

    studio = await _studio(db_async, async_client, apps=("bookings", "payments"))
    slots = await _slots(async_client, studio)
    response = await _book(async_client, studio, slots[0])
    assert response.status_code == 201, response.text
    booking_id = response.json()["booking"]["id"]
    assert (await _post(async_client, studio, booking_id)).status_code == 409


async def test_a_cancelled_booking_is_rejected(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    cancelled = await async_client.post(
        f"{API}/org/bookings/{booking_id}/cancel",
        headers=studio.headers,
        json={"reason": "Closed"},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert (await _post(async_client, studio, booking_id)).status_code == 409
    assert await _charges(db_async, booking_id) == 0


async def test_another_organisations_booking_is_404(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, booking_id = await _unpaid(db_async, async_client)
    outsider = await _deposit_studio(db_async, async_client)
    assert (await _post(async_client, outsider, booking_id)).status_code == 404
    assert await _charges(db_async, booking_id) == 0


async def test_a_plain_member_and_a_missing_key_are_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    member = await make_user(db_async)
    await org_service.add_member(
        db_async,
        organisation_id=studio.org_id,
        user_id=member.id,
        role=MembershipRole.MEMBER,
    )
    await db_async.commit()
    headers = headers_for(member, studio.org_id)
    assert (
        await _post(async_client, studio, booking_id, headers=headers)
    ).status_code == 403
    no_key = await async_client.post(
        _url(booking_id), headers=studio.headers, json={"method": "cash"}
    )
    assert no_key.status_code == 400
    assert await _charges(db_async, booking_id) == 0


PAYMENTS = "/api/v1/payments"


async def test_a_newer_intent_for_the_booking_is_not_the_one_captured(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    other = await async_client.post(
        f"{PAYMENTS}/org/intents",
        headers=studio.headers,
        json={
            "amount_minor": 100,
            "currency": "XCD",
            "provider": "manual",
            "source_type": "bookings.deposit",
            "source_id": booking_id,
            "idempotency_key": "stray-intent",
        },
    )
    assert other.status_code == 201, other.text
    response = await _post(async_client, studio, booking_id)
    assert response.status_code == 200, response.text
    assert await _charges(db_async, booking_id) == 1  # the booking's own intent
    stray = await db_async.scalar(
        select(Intent)
        .where(Intent.idempotency_key == "stray-intent")
        .execution_options(populate_existing=True)
    )
    assert stray is not None and stray.status != "succeeded"
    audit = await db_async.scalar(
        select(AuditEntry).where(AuditEntry.entity_id == booking_id)
    )
    assert audit is not None
    changes = {c["field"]: c for c in audit.changes}
    assert changes["deposit_captured_minor"]["new"] == DEPOSIT
    assert changes["reference"]["sensitive"] is True


async def test_an_intent_that_differs_from_the_deposit_is_rejected(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    intent.amount_minor = DEPOSIT + 1
    await db_async.commit()
    assert (await _post(async_client, studio, booking_id)).status_code == 409
    assert await _charges(db_async, booking_id) == 0


async def test_an_open_online_payment_is_rejected(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    intent.provider = "stripe"
    intent.status = "processing"
    await db_async.commit()
    response = await _post(async_client, studio, booking_id)
    assert response.status_code == 409
    assert "expire or fail" in response.json()["detail"]
    assert await _charges(db_async, booking_id) == 0


async def test_a_booking_missing_its_intent_gets_a_manual_one(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    await db_async.delete(intent)
    await db_async.commit()
    response = await _post(async_client, studio, booking_id)
    assert response.status_code == 200, response.text
    assert response.json()["deposit_captured_minor"] == DEPOSIT


async def test_a_confirmed_booking_with_no_capture_can_take_the_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    booking = await db_async.get(Booking, uuid.UUID(booking_id))
    assert booking is not None
    booking.status = "confirmed"
    await db_async.commit()
    response = await _post(async_client, studio, booking_id)
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "confirmed"
    assert response.json()["deposit_captured_minor"] == DEPOSIT


async def test_an_api_key_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    created = await async_client.post(
        "/api/v1/organisations/org/api-keys",
        headers=studio.headers,
        json={"name": "Kiosk", "scopes": ["bookings.write"]},
    )
    assert created.status_code == 201, created.text
    key = {"Authorization": f"Bearer {created.json()['secret']}"}
    response = await async_client.post(
        _url(booking_id),
        headers={
            **key,
            "Idempotency-Key": "k",
            "X-Barrels-Organisation": studio.org_id,
        },
        json={"method": "cash"},
    )
    assert response.status_code == 401
    assert await _charges(db_async, booking_id) == 0


async def test_the_bookings_app_session_is_accepted(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    membership = await db_async.scalar(
        select(Membership).where(Membership.organisation_id == studio.org_id)
    )
    assert membership is not None
    owner = await make_user_by_id(db_async, membership.user_id)
    await seed_permissions_and_roles_async(db_async)
    role = await db_async.scalar(select(Role).where(Role.name == "bookings-member"))
    assert role is not None
    await assign_role(db_async, user=owner, role=role)
    await db_async.commit()
    response = await _post(
        async_client,
        studio,
        booking_id,
        headers=app_headers(owner, studio.org_id),
    )
    assert response.status_code == 200, response.text


async def make_user_by_id(db: AsyncSession, user_id: uuid.UUID):
    from src.auth.models import User

    user = await db.get(User, user_id)
    assert user is not None
    return user


async def test_the_payments_entitlement_is_required(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    from src.organisations import service as organisation_service

    studio, booking_id = await _unpaid(db_async, async_client)
    await organisation_service.set_app_enabled(
        db_async, organisation_id=studio.org_id, app_key="payments", enabled=False
    )
    await db_async.commit()
    assert (await _post(async_client, studio, booking_id)).status_code == 403
    assert await _charges(db_async, booking_id) == 0
