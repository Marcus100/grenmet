"""Bookings wired to contacts (PF3) and the rewards outbox (PF8)."""

import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.bookings import public
from src.bookings.models import Booking, BookingStatus, Customer
from src.contacts import service as contacts_service
from src.contacts.models import ConsentPurpose, Contact
from src.outbox import Outbox
from src.rewards import outbox_handlers as rewards_handlers
from src.rewards import service as rewards_service
from src.rewards.models import Entry
from src.rewards.schemas import ProgramCreate
from tests.bookings.test_public_bookings import API, Studio, _book, _slots, _studio
from tests.factories import make_user

FULL = ("bookings", "contacts", "rewards")


async def _customer(db: AsyncSession, receipt: dict) -> Customer:
    db.expire_all()
    booking = await db.get(Booking, uuid.UUID(receipt["booking"]["id"]))
    assert booking is not None
    customer = await db.get(Customer, booking.customer_id)
    assert customer is not None
    return customer


async def _book_one(
    client: httpx.AsyncClient,
    studio: Studio,
    slot: int = 0,
    **overrides: object,
) -> dict:
    slots = await _slots(client, studio)
    resp = await _book(client, studio, slots[slot], **overrides)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_customer_is_linked_to_a_contact_with_consent(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, apps=FULL)
    email = f"linked-{uuid.uuid4().hex[:6]}@example.com"
    receipt = await _book_one(
        async_client,
        studio,
        customer_email=email,
        marketing_consent=True,
    )
    customer = await _customer(db_async, receipt)
    assert customer.contact_id is not None
    contact = await db_async.get(Contact, customer.contact_id)
    assert contact is not None
    contact_id = contact.id
    assert contact.organisation_id == studio.org_id
    assert contact.source == "bookings"
    assert contact.name == "Ada Lovelace"
    consents = await contacts_service.current_consents(db_async, contact_id)
    assert consents[ConsentPurpose.MARKETING].granted is True

    # A second booking by the same person reuses the contact.
    again = await _book_one(async_client, studio, slot=2, customer_email=email)
    second = await _customer(db_async, again)
    assert second.contact_id == contact_id
    consents = await contacts_service.current_consents(db_async, contact_id)
    assert consents[ConsentPurpose.MARKETING].granted is False


async def test_every_customer_has_a_contact_even_without_the_contacts_product(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, apps=("bookings",))
    receipt = await _book_one(async_client, studio, marketing_consent=True)
    customer = await _customer(db_async, receipt)
    contacts = (
        await db_async.scalars(
            select(Contact).where(Contact.organisation_id == studio.org_id)
        )
    ).all()
    assert [c.id for c in contacts] == [customer.contact_id]
    consents = await contacts_service.current_consents(db_async, contacts[0].id)
    assert consents[ConsentPurpose.MARKETING].granted is True


async def test_erasing_or_merging_a_contact_does_not_break_bookings(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, apps=FULL)
    email = f"erase-{uuid.uuid4().hex[:6]}@example.com"
    receipt = await _book_one(async_client, studio, customer_email=email)
    customer = await _customer(db_async, receipt)
    assert customer.contact_id is not None
    customer_id = customer.id
    contact = await db_async.get(Contact, customer.contact_id)
    assert contact is not None
    contact_id = contact.id
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()

    managed = await async_client.get(f"{API}/public/bookings/{receipt['manage_token']}")
    assert managed.status_code == 200, managed.text
    studio_list = await async_client.get(
        f"{API}/org/bookings",
        headers=studio.headers,
        params={
            "starts_from": "2027-01-01T00:00:00Z",
            "ends_before": "2027-02-01T00:00:00Z",
        },
    )
    assert studio_list.status_code == 200
    # Booking again revives the contact and keeps the link.
    again = await _book_one(async_client, studio, slot=2, customer_email=email)
    revived = await _customer(db_async, again)
    assert revived.contact_id == contact_id

    # A merge deletes the dropped contact: the customer moves to the kept one.
    admin = await make_user(db_async)
    keep = await contacts_service.upsert_contact(
        db_async,
        studio.org_id,
        email=f"keep-{uuid.uuid4().hex[:6]}@example.com",
        source="manual",
    )
    keep_id = keep.id
    await contacts_service.merge_contacts(
        db_async, admin, keep_id, contact_id, organisation_id=studio.org_id
    )
    await db_async.commit()
    db_async.expire_all()
    cleared = await db_async.get(Customer, customer_id)
    assert cleared is not None and cleared.contact_id == keep_id


async def _rewards_setup(
    db: AsyncSession, client: httpx.AsyncClient
) -> tuple[Studio, uuid.UUID, dict]:
    studio = await _studio(db, client, apps=FULL)
    member_id = (await make_user(db)).id
    actor = await make_user(db)
    await rewards_service.create_program(
        db,
        organisation_id=studio.org_id,
        actor=actor,
        payload=ProgramCreate(
            name="Lash card",
            stamps_required=3,
            reward_description="A free fill",
            qualifying_source_type="bookings.completed",
        ),
    )
    email = f"member-{uuid.uuid4().hex[:6]}@example.com"
    receipt = await _book_one(client, studio, customer_email=email)
    customer = await _customer(db, receipt)
    contact = await db.get(Contact, customer.contact_id)
    assert contact is not None
    contact.user_id = member_id
    await db.commit()
    return studio, member_id, receipt


async def _complete(db: AsyncSession, receipt: dict) -> Booking:
    db.expire_all()
    booking = await db.get(Booking, uuid.UUID(receipt["booking"]["id"]))
    assert booking is not None
    await public.transition(db, booking, BookingStatus.COMPLETED)
    await db.commit()
    return booking


async def test_completed_booking_earns_stamps_through_the_outbox(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, member_id, receipt = await _rewards_setup(db_async, async_client)
    booking = await _complete(db_async, receipt)

    key = f"bookings.completed:{booking.id}:{member_id}"
    rows = (
        await db_async.scalars(
            select(Outbox).where(
                Outbox.topic == rewards_handlers.TOPIC, Outbox.dedupe_key == key
            )
        )
    ).all()
    assert len(rows) == 1 and rows[0].organisation_id == studio.org_id

    assert await outbox.drain(db_async, only_topics={rewards_handlers.TOPIC}) >= 1
    entries = (
        await db_async.scalars(select(Entry).where(Entry.account_id == member_id))
    ).all()
    assert [(e.source_type, e.source_id, e.amount) for e in entries] == [
        ("bookings.completed", str(booking.id), 1)
    ]

    # Emitting again is deduplicated; replaying the handler credits nothing more.
    assert not await rewards_service.emit_qualifying_action(
        db_async,
        source_type="bookings.completed",
        source_id=str(booking.id),
        organisation_id=studio.org_id,
        user_id=member_id,
    )
    await rewards_handlers.record_qualifying_action(
        db_async,
        outbox.OutboxMessage(
            id=uuid.uuid4(),
            organisation_id=studio.org_id,
            topic=rewards_handlers.TOPIC,
            payload={
                "source_type": "bookings.completed",
                "source_id": str(booking.id),
                "organisation_id": studio.org_id,
                "user_id": str(member_id),
            },
            dedupe_key=key,
            attempts=0,
        ),
    )
    await db_async.commit()
    count = len(
        (
            await db_async.scalars(select(Entry).where(Entry.account_id == member_id))
        ).all()
    )
    assert count == 1


async def test_completion_without_a_linked_account_earns_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, apps=FULL)
    receipt = await _book_one(async_client, studio)
    booking = await _complete(db_async, receipt)
    rows = (
        await db_async.scalars(
            select(Outbox).where(
                Outbox.topic == rewards_handlers.TOPIC,
                Outbox.dedupe_key.like(f"bookings.completed:{booking.id}:%"),
            )
        )
    ).all()
    assert rows == []


async def test_completion_with_an_erased_contact_earns_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _studio_row, _member, receipt = await _rewards_setup(db_async, async_client)
    customer = await _customer(db_async, receipt)
    contact = await db_async.get(Contact, customer.contact_id)
    assert contact is not None
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()
    booking = await _complete(db_async, receipt)
    rows = (
        await db_async.scalars(
            select(Outbox).where(
                Outbox.topic == rewards_handlers.TOPIC,
                Outbox.dedupe_key.like(f"bookings.completed:{booking.id}:%"),
            )
        )
    ).all()
    assert rows == []
