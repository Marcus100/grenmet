"""Outlet walk-in buyers become organisation contacts (#1986, slice 1).

Walk-ins carry a name or phone and never an email, so they are never matched:
each one is a new contact (``email_hash`` NULL). Online buyers are out of scope.
"""

import uuid

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contacts import service as contacts_service
from src.contacts.models import Contact, ContactConsent
from src.events import buyer_contacts
from src.events.models import Order, Organiser
from src.organisations.models import MembershipRole
from tests.events.support import SessionFactory
from tests.events.test_outlet import cash_event, open_till, sell
from tests.events.test_paid_orders import PRICE, Shop, _shop, make_user
from tests.organisations.support import make_org


async def _order(
    events_db: SessionFactory,
    shop: Shop,
    *,
    name: str | None = None,
    phone: str | None = None,
    channel: str = "outlet",
    user_id: uuid.UUID | None = None,
) -> uuid.UUID:
    async with events_db() as events:
        order = Order(
            listing_id=shop.listing_id,
            user_id=user_id,
            channel=channel,
            payment_method="cash_outlet" if channel == "outlet" else "none",
            status="confirmed",
            total_minor=PRICE,
            collected_minor=PRICE if channel == "outlet" else 0,
            buyer_name=name,
            buyer_phone=phone,
        )
        events.add(order)
        await events.commit()
        return order.id


async def _contact_id_of(events_db: SessionFactory, order_id: uuid.UUID) -> str | None:
    async with events_db() as events:
        return await events.scalar(
            select(Order.contact_id).where(Order.id == order_id)
        )


async def _run_backfill(events_db: SessionFactory, limit: int = 100) -> int:
    async with events_db() as events:
        done = await buyer_contacts.backfill_batch(events, limit=limit)
        await events.commit()
        return done


@pytest.mark.asyncio
async def test_two_nameless_walk_ins_stay_two_contacts(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, linked=True)
    first = await _order(events_db, shop, name="Walk-in", phone="473-555-0101")
    second = await _order(events_db, shop, name="Walk-in", phone="473-555-0101")

    assert await _run_backfill(events_db) == 2

    first_contact = await _contact_id_of(events_db, first)
    second_contact = await _contact_id_of(events_db, second)
    assert first_contact is not None and second_contact is not None
    assert first_contact != second_contact
    rows = (
        await db_async.scalars(
            select(Contact).where(
                Contact.organisation_id == shop.organisation_id,
                Contact.source == "events",
            )
        )
    ).all()
    assert len(rows) == 2
    assert all(row.email_hash is None and row.email is None for row in rows)


@pytest.mark.asyncio
async def test_a_walk_in_never_joins_a_booking_contact_of_the_same_business(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, linked=True)
    org_id = shop.organisation_id
    booked = await contacts_service.upsert_contact(
        db_async,
        org_id,
        email="ada@example.com",
        name="Ada",
        source="bookings",
    )
    await db_async.commit()
    order = await _order(events_db, shop, name="Ada")

    await _run_backfill(events_db)

    walk_in = await _contact_id_of(events_db, order)
    assert walk_in is not None and walk_in != booked.id
    await db_async.refresh(booked)
    assert booked.email_hash is not None  # the booking contact is untouched
    assert booked.name == "Ada"


@pytest.mark.asyncio
async def test_a_walk_in_is_a_contact_of_its_own_business_only(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop_a = await _shop(db_async, events_db, linked=True)
    shop_b = await _shop(db_async, events_db, linked=True)
    order = await _order(events_db, shop_a, name="Marcia")

    await _run_backfill(events_db)

    contact_id = await _contact_id_of(events_db, order)
    assert contact_id is not None
    contact = await db_async.get(Contact, contact_id)
    assert contact is not None
    assert contact.organisation_id == shop_a.organisation_id
    assert contact.organisation_id != shop_b.organisation_id


@pytest.mark.asyncio
async def test_backfill_records_no_consent(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, linked=True)
    order = await _order(events_db, shop, name="Walk-in")

    await _run_backfill(events_db)

    contact_id = await _contact_id_of(events_db, order)
    assert contact_id is not None
    consents = await db_async.scalar(
        select(func.count())
        .select_from(ContactConsent)
        .where(ContactConsent.contact_id == contact_id)
    )
    assert consents == 0


@pytest.mark.asyncio
async def test_backfill_is_resumable_and_a_rolled_back_batch_leaves_nothing(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, linked=True)
    first = await _order(events_db, shop, name="One")
    second = await _order(events_db, shop, name="Two")

    # A batch that dies before its commit leaves no contact and no link behind.
    async with events_db() as events:
        await buyer_contacts.backfill_batch(events, limit=100)
        await events.rollback()
    assert await _contact_id_of(events_db, first) is None
    assert await _contact_id_of(events_db, second) is None

    assert await _run_backfill(events_db, limit=1) == 1
    assert await _run_backfill(events_db, limit=1) == 1
    assert await _run_backfill(events_db, limit=1) == 0
    assert await _contact_id_of(events_db, first) is not None
    assert await _contact_id_of(events_db, second) is not None


@pytest.mark.asyncio
async def test_online_orders_and_legacy_organisers_are_left_alone(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    linked = await _shop(db_async, events_db, linked=True)
    legacy = await _shop(db_async, events_db, linked=False)
    buyer = await make_user(db_async)
    online = await _order(
        events_db,
        linked,
        channel="online",
        user_id=buyer.id,
    )
    unlinked_walk_in = await _order(events_db, legacy, name="Legacy walk-in")

    await _run_backfill(events_db)

    assert await _contact_id_of(events_db, online) is None
    assert await _contact_id_of(events_db, unlinked_walk_in) is None


@pytest.mark.asyncio
async def test_a_blank_name_and_phone_count_as_no_name(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, linked=True)
    blank = await _order(events_db, shop, name="", phone="   ")
    spaces = await _order(events_db, shop, name="   ")
    named = await _order(events_db, shop, name="  ", phone="473-555-0102")

    assert await _run_backfill(events_db) == 1

    assert await _contact_id_of(events_db, blank) is None
    assert await _contact_id_of(events_db, spaces) is None
    contact_id = await _contact_id_of(events_db, named)
    assert contact_id is not None
    contact = await db_async.get(Contact, contact_id)
    assert contact is not None
    assert contact.name is None  # a blank name is stored as no name
    assert contact.phone == "473-555-0102"


@pytest.mark.asyncio
async def test_a_nameless_cash_sale_gets_no_contact(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, linked=True)
    order = await _order(events_db, shop)

    await _run_backfill(events_db)

    assert await _contact_id_of(events_db, order) is None


@pytest.mark.asyncio
async def test_erasing_a_walk_in_clears_the_order_copy(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, linked=True)
    order = await _order(events_db, shop, name="Marcia", phone="473-555-0101")
    await _run_backfill(events_db)
    contact_id = await _contact_id_of(events_db, order)
    assert contact_id is not None
    contact = await db_async.get(Contact, contact_id)
    assert contact is not None
    actor = await make_user(db_async)

    await contacts_service.erase_contact(db_async, contact, actor=actor)
    await db_async.commit()

    async with events_db() as events:
        row = await events.get(Order, order)
        assert row is not None
        assert row.buyer_name is None
        assert row.buyer_phone is None
        assert row.contact_id == contact_id  # the order itself is kept


@pytest.mark.asyncio
async def test_a_new_cash_sale_links_its_walk_in_at_once(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    staff, event = await cash_event(events_db, db_async)
    org = await make_org(
        db_async,
        f"Harbour Co {uuid.uuid4().hex[:6]}",
        members=((staff, MembershipRole.OWNER),),
        apps=("events",),
    )
    async with events_db() as events:
        organiser = await events.scalar(
            select(Organiser).where(Organiser.slug == "harbour-crew")
        )
        assert organiser is not None
        organiser.organisation_id = org.id
        await events.commit()
    await open_till(staff, event)

    response = await sell(
        staff, event, 1, 2500, buyer_name="Marcia", buyer_phone="473-555-0101"
    )
    assert response.status_code == 201, response.text
    order_id = response.json()["order_id"]

    contact_id = await _contact_id_of(events_db, uuid.UUID(order_id))
    assert contact_id is not None
    contact = await db_async.get(Contact, contact_id)
    assert contact is not None
    assert contact.name == "Marcia"
    assert contact.email_hash is None
    assert contact.organisation_id == org.id
