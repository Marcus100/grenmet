"""The erasure backfill (#2028) clears walk-in order names and phones for erased
walk-ins, and leaves a live walk-in's order alone. Assertions read the database."""

from sqlalchemy.ext.asyncio import AsyncSession

from src.contacts import erasure_backfill
from src.contacts import service as contacts_service
from src.contacts.models import Contact
from src.events.models import Order
from tests.events.support import SessionFactory
from tests.events.test_buyer_contacts import _contact_id_of, _order, _run_backfill
from tests.events.test_paid_orders import _shop


async def test_an_erased_walk_in_loses_its_order_copies_and_a_live_one_keeps_them(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, linked=True)
    gone_order = await _order(events_db, shop, name="Gone Walk", phone="473-555-0101")
    live_order = await _order(events_db, shop, name="Live Walk", phone="473-555-0102")
    await _run_backfill(events_db)
    gone_contact_id = await _contact_id_of(events_db, gone_order)
    live_contact_id = await _contact_id_of(events_db, live_order)
    assert gone_contact_id is not None and live_contact_id is not None

    contact = await db_async.get(Contact, gone_contact_id)
    assert contact is not None
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()
    # The copies an erasure from before #1986 left on the order.
    row = await db_async.get(Order, gone_order)
    assert row is not None
    row.buyer_name = "Gone Walk"
    row.buyer_phone = "473-555-0101"
    await db_async.commit()

    result = await erasure_backfill.backfill_erased_copies(db_async)

    db_async.expire_all()
    erased = await db_async.get(Order, gone_order)
    assert erased is not None
    assert erased.buyer_name is None and erased.buyer_phone is None
    live = await db_async.get(Order, live_order)
    assert live is not None
    assert live.buyer_name == "Live Walk" and live.buyer_phone == "473-555-0102"
    assert result.contacts == 1
    assert result.order_rows == 1
