"""Paid ticket tiers on the shared payments core (N4b).

Events, payments and the outbox share the main database (ADR-0003): ``db_async``
and ``events_db`` sessions look at the same tables. No test sends mail or reaches a network: the email
sender is stubbed and the Stripe rail runs over ``httpx.MockTransport``.
"""

import asyncio
import uuid
from dataclasses import dataclass
from datetime import timedelta
from importlib import import_module
from typing import Any

import httpx
import pytest
from sqlalchemy import func, select, update
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src import email as email_module
from src import outbox
from src.auth.models import User
from src.email_config import email_settings
from src.events import order_fulfilment, order_payments
from src.events import schemas as event_schemas
from src.events import service as events_service
from src.events.exceptions import EventsConflict
from src.events.models import (
    Listing,
    Order,
    Organiser,
    Ticket,
    TicketTier,
)
from src.events.service import ticketing
from src.notifications import outbox_handlers
from src.organisations.models import MembershipRole
from src.outbox import Outbox
from src.payments import schemas as payment_schemas
from src.payments import service as payments_service
from src.payments.models import Intent, IntentStatus, LedgerEntry
from src.utils.datetime import utc_now
from tests.events.support import BASE, SessionFactory, client_as
from tests.factories import make_user as make_db_user
from tests.organisations.support import make_org
from tests.payments import conftest as payments_conftest

import_module("src.events.payment_handlers")  # registers the two Events topics
stripe_env = payments_conftest.stripe_env
PRICE = 5000
TOPICS = {order_payments.PAID_TOPIC, order_payments.REFUNDED_TOPIC}
WEBHOOK = "/api/v1/payments/public/webhooks/stripe"


@pytest.fixture
def sent_emails(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Email is configured with a fake sender; returns what it was asked to send."""
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", None)
    sent: list[dict[str, Any]] = []
    monkeypatch.setattr(email_module, "send_email", lambda **kw: sent.append(kw))
    return sent


async def make_user(db: AsyncSession, *, email: str | None = None) -> User:
    """A real main-database user, handed back detached.

    The shared session expires its objects on every commit, and an async session
    cannot lazy-load them again, so tests keep a plain copy of the columns."""
    row = await make_db_user(db, email=email)
    return User(
        id=row.id,
        email=row.email,
        username=row.username,
        first_name=row.first_name,
        last_name=row.last_name,
        is_active=True,
        is_superuser=False,
    )


@dataclass
class Shop:
    organisation_id: str
    owner: User
    slug: str
    listing_id: uuid.UUID
    tier_id: uuid.UUID


async def _shop(
    db: AsyncSession,
    events_db: SessionFactory,
    *,
    allocation: int = 3,
    limit: int = 4,
    apps: tuple[str, ...] = ("payments", "events"),
    linked: bool = True,
) -> Shop:
    owner = await make_user(db)
    org = await make_org(
        db,
        f"Fete Co {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER),),
        apps=apps,
    )
    now = utc_now()
    suffix = uuid.uuid4().hex[:8]
    async with events_db() as events:
        organiser = Organiser(
            slug=f"org-{suffix}",
            name="Fete Co",
            verified=True,
            organisation_id=org.id if linked else None,
        )
        events.add(organiser)
        await events.flush()
        listing = Listing(
            slug=f"fete-{suffix}",
            title="Paid Fete",
            summary="All inclusive",
            category="fete",
            parish="st-george",
            venue="Stadium",
            starts_at=now + timedelta(days=5),
            ends_at=now + timedelta(days=5, hours=5),
            admission="ticketed",
            capacity=1000,
            organiser_id=organiser.id,
            status="published",
        )
        events.add(listing)
        await events.flush()
        tier = TicketTier(
            listing_id=listing.id,
            name="General",
            price_minor=PRICE,
            allocation=allocation,
            per_account_limit=limit,
        )
        events.add(tier)
        await events.commit()
        return Shop(org.id, owner, listing.slug, listing.id, tier.id)


async def _order(
    buyer: User,
    shop: Shop,
    quantity: int = 1,
    key: str | None = None,
) -> httpx.Response:
    headers = {"Idempotency-Key": key} if key else {}
    async with client_as(buyer) as client:
        return await client.post(
            f"{BASE}/listings/{shop.slug}/orders",
            json={"items": [{"tier_id": str(shop.tier_id), "quantity": quantity}]},
            headers=headers,
        )


async def _intent(db: AsyncSession, order_id: str) -> Intent | None:
    return await db.scalar(
        select(Intent)
        .where(
            Intent.source_type == order_payments.SOURCE_TYPE,
            Intent.source_id == order_id,
        )
        .execution_options(populate_existing=True)
    )


async def _intent_count(db: AsyncSession, shop: Shop) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(Intent)
            .where(Intent.organisation_id == shop.organisation_id)
        )
        or 0
    )


async def _pay_by_hand(db: AsyncSession, shop: Shop, order_id: str) -> None:
    """Staff record the money (the manual rail)."""
    intent = await _intent(db, order_id)
    assert intent is not None
    await payments_service.record_manual_payment(
        db,
        organisation_id=shop.organisation_id,
        intent_id=intent.id,
        actor=shop.owner,
        payload=payment_schemas.ManualPaymentCreate(method="cash", reference="R-1"),
    )
    await db.commit()


async def _drain(db: AsyncSession) -> int:
    db.expire_all()  # the API changed rows in other sessions; the worker starts fresh
    return await outbox.drain(db, only_topics=TOPICS)


async def _row(events_db: SessionFactory, order_id: str) -> Order:
    async with events_db() as events:
        order = await events.get(Order, uuid.UUID(order_id))
        assert order is not None
        return order


async def _tickets(events_db: SessionFactory, order_id: str) -> list[Ticket]:
    async with events_db() as events:
        return list(
            await events.scalars(
                select(Ticket).where(Ticket.order_id == uuid.UUID(order_id))
            )
        )


async def _remaining(events_db: SessionFactory, shop: Shop) -> int:
    async with events_db() as events:
        tiers = await events_service.discover._tiers(events, shop.listing_id)
    return tiers[0].remaining


# --- ordering ------------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_a_paid_tier_holds_stock_and_creates_one_intent(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, allocation=3)
    buyer = await make_user(db_async)
    response = await _order(buyer, shop, 2, key="order-key-0001")
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["status"] == "pending_payment"
    assert order["payment_required"] is True
    assert order["tickets"] == []
    assert order["total_minor"] == 2 * PRICE
    assert order["checkout_url"] is None  # no Stripe key: staff record the payment
    assert order["payment_expires_at"] is not None

    intent = await _intent(db_async, order["id"])
    assert intent is not None
    assert intent.amount_minor == 2 * PRICE
    assert intent.provider == "manual"
    assert intent.created_by_user_id is None
    assert intent.idempotency_key == f"events.order:{order['id']}"
    assert intent.status == IntentStatus.REQUIRES_PAYMENT.value
    assert intent.metadata_["listing_id"] == str(shop.listing_id)
    stored = await _row(events_db, order["id"])
    assert stored.payment_intent_id == intent.id
    assert stored.payment_method == "online"
    assert stored.status == "pending_payment"

    # The stock is held: only one seat is left for anybody else.
    assert await _remaining(events_db, shop) == 1
    other = await _order(await make_user(db_async), shop, 2)
    assert other.status_code == 409
    assert "Only 1" in other.json()["detail"]
    assert (await _order(await make_user(db_async), shop, 1)).status_code == 201


@pytest.mark.asyncio
async def test_replaying_the_idempotency_key_returns_the_same_order(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, allocation=5)
    buyer = await make_user(db_async)
    first = await _order(buyer, shop, 2, key="replay-key-0001")
    replay = await _order(buyer, shop, 2, key="replay-key-0001")
    assert first.status_code == replay.status_code == 201
    assert replay.json()["id"] == first.json()["id"]
    assert replay.json()["status"] == "pending_payment"
    assert await _intent_count(db_async, shop) == 1
    async with events_db() as events:
        orders = await events.scalar(select(func.count()).select_from(Order))
    assert orders == 1
    assert await _remaining(events_db, shop) == 3  # held once, not twice

    different = await _order(buyer, shop, 3, key="replay-key-0001")
    assert different.status_code == 409
    # Another member's identical key is their own order.
    assert (
        await _order(await make_user(db_async), shop, 2, key="replay-key-0001")
    ).status_code == 201


@pytest.mark.asyncio
async def test_the_stripe_test_rail_returns_a_checkout_url_once(
    db_async: AsyncSession,
    events_db: SessionFactory,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    shop = await _shop(db_async, events_db)
    buyer = await make_user(db_async)
    first = await _order(buyer, shop, 1, key="stripe-key-0001")
    assert first.json()["checkout_url"] == "https://checkout.stripe.com/c/pay/cs_test_1"
    replay = await _order(buyer, shop, 1, key="stripe-key-0001")
    assert replay.json()["checkout_url"] == first.json()["checkout_url"]
    assert len(stripe_env.requests) == 1
    intent = await _intent(db_async, first.json()["id"])
    assert intent is not None
    assert intent.provider == "stripe"
    assert intent.status == IntentStatus.PROCESSING.value
    async with client_as(buyer) as client:
        mine = await client.get(f"{BASE}/me/orders/{first.json()['id']}")
        assert mine.status_code == 200
        assert mine.json()["checkout_url"] == first.json()["checkout_url"]
        stranger = client_as(await make_user(db_async))
    async with stranger as client:
        assert (
            await client.get(f"{BASE}/me/orders/{first.json()['id']}")
        ).status_code == 404


@pytest.mark.asyncio
async def test_a_paid_tier_needs_a_payable_organiser(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    buyer = await make_user(db_async)
    no_entitlement = await _shop(db_async, events_db, apps=())
    refused = await _order(buyer, no_entitlement)
    assert refused.status_code == 409
    assert "online payment" in refused.json()["detail"]
    legacy = await _shop(db_async, events_db, linked=False)
    assert (await _order(buyer, legacy)).status_code == 409
    async with events_db() as events:
        assert await events.scalar(select(func.count()).select_from(Order)) == 0


@pytest.mark.asyncio
async def test_a_deadlock_victim_loses_the_race_like_a_sold_out_tier(
    db_async: AsyncSession,
    events_db: SessionFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    deadlock = DBAPIError("SELECT", {}, Exception("deadlock detected"))
    assert ticketing.is_deadlock(deadlock)
    assert not ticketing.is_deadlock(DBAPIError("SELECT", {}, Exception("other")))

    async def victim(*_: object, **__: object) -> None:
        raise deadlock

    monkeypatch.setattr(ticketing, "_create_order", victim)
    shop = await _shop(db_async, events_db)
    refused = await _order(await make_user(db_async), shop)
    assert refused.status_code == 409
    assert "just taken" in refused.json()["detail"]


@pytest.mark.asyncio
async def test_two_buyers_racing_for_the_last_ticket_exactly_one_wins(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, allocation=1)
    buyers = [await make_user(db_async), await make_user(db_async)]

    async def attempt(buyer: User) -> str:
        async with events_db() as events:
            try:
                await events_service.claim_tickets(
                    events,
                    buyer,
                    shop.slug,
                    event_schemas.OrderCreate(
                        items=[
                            event_schemas.OrderItemInput(
                                tier_id=shop.tier_id, quantity=1
                            )
                        ]
                    ),
                )
            except EventsConflict as error:
                return error.message
            return "ok"

    results = await asyncio.gather(*(attempt(buyer) for buyer in buyers))
    assert results.count("ok") == 1
    (lost,) = (r for r in results if r != "ok")
    # The loser saw the held seat as sold out, or was the deadlock victim.
    assert "sold out" in lost or "just taken" in lost
    async with events_db() as events:
        held = await events.scalar(
            select(func.count())
            .select_from(Order)
            .where(Order.status == "pending_payment")
        )
    assert held == 1
    assert await _intent_count(db_async, shop) == 1


# --- payment received ----------------------------------------------------------------------


@pytest.mark.asyncio
async def test_payment_issues_tickets_exactly_once_even_if_the_handler_runs_twice(
    db_async: AsyncSession,
    events_db: SessionFactory,
    sent_emails: list[dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    shop = await _shop(db_async, events_db)
    buyer = await make_user(db_async, email=f"buyer-{uuid.uuid4().hex[:6]}@example.com")
    order_id = (await _order(buyer, shop, 2)).json()["id"]
    assert await _tickets(events_db, order_id) == []

    await _pay_by_hand(db_async, shop, order_id)
    assert await _drain(db_async) >= 1
    # At-least-once: the same message delivered again must change nothing.
    intent = await _intent(db_async, order_id)
    assert intent is not None
    again = await order_fulfilment.fulfil_paid(
        db_async,
        organisation_id=shop.organisation_id,
        order_id=uuid.UUID(order_id),
        intent_id=intent.id,
    )
    await db_async.commit()
    assert again == "duplicate"
    assert await _drain(db_async) == 0

    tickets = await _tickets(events_db, order_id)
    assert len(tickets) == 2
    assert {t.status for t in tickets} == {"valid"}
    assert len({t.code for t in tickets}) == 2
    order = await _row(events_db, order_id)
    assert order.status == "confirmed"
    assert order.collected_minor == 2 * PRICE
    assert order.refunded_minor == 0
    assert order.paid_at is not None

    async with client_as(buyer) as client:
        mine = (await client.get(f"{BASE}/me/tickets")).json()
        assert len(mine) == 2
        done = (await client.get(f"{BASE}/me/orders/{order_id}")).json()
        assert done["status"] == "confirmed"
        assert len(done["tickets"]) == 2
        assert done["payment_required"] is False
        assert done["checkout_url"] is None
        # A paid ticket is refunded through payments, not cancelled for free.
        refused = await client.post(f"{BASE}/me/tickets/{mine[0]['id']}/cancel")
        assert refused.status_code == 409

    # One receipt on the platform outbox, sent through the stubbed sender.
    receipts = list(
        await db_async.scalars(
            select(Outbox).where(
                Outbox.topic == outbox_handlers.EMAIL_SEND,
                Outbox.dedupe_key == f"events-order-paid:{order_id}",
            )
        )
    )
    assert len(receipts) == 1
    private = f"test.{uuid.uuid4().hex[:12]}"
    monkeypatch.setitem(outbox._HANDLERS, private, outbox_handlers.send_email)
    monkeypatch.setitem(
        outbox._DEAD_HANDLERS, private, outbox_handlers._email_send_dead
    )
    await db_async.execute(
        update(Outbox).where(Outbox.id == receipts[0].id).values(topic=private)
    )
    await db_async.commit()
    assert await outbox.drain(db_async, only_topics={private}) == 1
    assert [mail["email_to"] for mail in sent_emails] == [buyer.email]
    assert "Paid Fete" in str(sent_emails[0])


@pytest.mark.asyncio
async def test_a_rolled_back_fulfilment_loses_everything_and_the_replay_redoes_it(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    """One transaction: a rollback loses the tickets and the receipt together, and
    the replay then does all of it once."""
    shop = await _shop(db_async, events_db)
    buyer = await make_user(db_async)
    order_id = (await _order(buyer, shop)).json()["id"]
    await _pay_by_hand(db_async, shop, order_id)
    intent = await _intent(db_async, order_id)
    assert intent is not None
    intent_id = intent.id  # the rollback below expires the object

    async def run() -> str:
        return await order_fulfilment.fulfil_paid(
            db_async,
            organisation_id=shop.organisation_id,
            order_id=uuid.UUID(order_id),
            intent_id=intent_id,
        )

    assert await run() == "confirmed"
    await db_async.rollback()  # tickets, order and receipt are all lost together
    assert await _tickets(events_db, order_id) == []
    assert await run() == "confirmed"
    await db_async.commit()
    count = await db_async.scalar(
        select(func.count())
        .select_from(Outbox)
        .where(Outbox.dedupe_key == f"events-order-paid:{order_id}")
    )
    assert count == 1
    assert len(await _tickets(events_db, order_id)) == 1


# --- expiry ------------------------------------------------------------------------------


async def _age(events_db: SessionFactory, order_id: str, minutes: int = 31) -> None:
    async with events_db() as events:
        await events.execute(
            update(Order)
            .where(Order.id == uuid.UUID(order_id))
            .values(payment_expires_at=utc_now() - timedelta(minutes=minutes))
        )
        await events.commit()


@pytest.mark.asyncio
async def test_the_sweeper_releases_stock_and_cancels_the_intent(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, allocation=2)
    stale = (await _order(await make_user(db_async), shop, 2)).json()["id"]
    assert (await _order(await make_user(db_async), shop)).status_code == 409

    assert await order_fulfilment.expire_unpaid(db_async) == 0  # not due
    await _age(events_db, stale)
    assert await order_fulfilment.expire_unpaid(db_async) == 1
    assert await order_fulfilment.expire_unpaid(db_async) == 0

    assert (await _row(events_db, stale)).status == "expired"
    intent = await _intent(db_async, stale)
    assert intent is not None
    assert intent.status == IntentStatus.CANCELLED.value
    assert await _remaining(events_db, shop) == 2
    assert (await _order(await make_user(db_async), shop, 2)).status_code == 201


@pytest.mark.asyncio
async def test_the_worker_job_runs_the_sweeper_with_its_own_sessions(
    db_async: AsyncSession,
    events_db: SessionFactory,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src import operational_metrics
    from src.worker import main as worker

    recorded: list[tuple[str, bool]] = []

    async def record(_: object, name: str, __: str, success: bool) -> None:
        recorded.append((name, success))

    monkeypatch.setattr(operational_metrics, "record_job", record)
    shop = await _shop(db_async, events_db)
    order_id = (await _order(await make_user(db_async), shop)).json()["id"]
    await _age(events_db, order_id)
    assert await worker.expire_unpaid_event_orders({"job_id": "t"}) == 1
    assert await worker.expire_unpaid_event_orders({"job_id": "t"}) == 0
    assert (await _row(events_db, order_id)).status == "expired"
    assert recorded == [("expire_unpaid_event_orders", True)] * 2


@pytest.mark.asyncio
async def test_the_sweeper_skips_an_order_whose_payment_just_succeeded(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db)
    order_id = (await _order(await make_user(db_async), shop)).json()["id"]
    await _pay_by_hand(db_async, shop, order_id)  # handler has not run yet
    await _age(events_db, order_id)
    assert await order_fulfilment.expire_unpaid(db_async) == 0
    assert (await _row(events_db, order_id)).status == "pending_payment"
    await _drain(db_async)
    assert (await _row(events_db, order_id)).status == "confirmed"
    assert len(await _tickets(events_db, order_id)) == 1


@pytest.mark.asyncio
async def test_a_payment_after_expiry_is_refunded_and_issues_nothing(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_db: SessionFactory,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    shop = await _shop(db_async, events_db)
    order_id = (await _order(await make_user(db_async), shop)).json()["id"]
    await _age(events_db, order_id)
    assert await order_fulfilment.expire_unpaid(db_async) == 1
    intent = await _intent(db_async, order_id)
    assert intent is not None
    assert intent.status == IntentStatus.CANCELLED.value
    intent_id = intent.id

    # The card was charged anyway: the provider calls back after the hold ended.
    body, headers = payments_conftest.signed(
        payments_conftest.checkout_completed(intent_id, amount=PRICE)
    )
    assert (
        await async_client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200
    assert await _drain(db_async) >= 1

    assert await _tickets(events_db, order_id) == []
    order = await _row(events_db, order_id)
    assert order.status == "expired"
    assert (order.collected_minor, order.refunded_minor) == (PRICE, PRICE)
    refunded = await payments_service.find_by_source(
        db_async,
        organisation_id=shop.organisation_id,
        source_type=order_payments.SOURCE_TYPE,
        source_id=order_id,
    )
    assert refunded is not None
    assert (refunded.captured_minor, refunded.refunded_minor) == (PRICE, PRICE)
    assert any(r.url.path == "/v1/refunds" for r in stripe_env.requests)
    assert await _remaining(events_db, shop) == 3  # nothing was issued or held
    # The refund itself is announced too; replaying everything refunds nothing twice.
    assert await _drain(db_async) == 1
    assert await _drain(db_async) == 0
    ledger = await db_async.scalar(
        select(func.count())
        .select_from(LedgerEntry)
        .where(LedgerEntry.intent_id == intent_id)
    )
    assert ledger == 2  # one charge, one refund


@pytest.mark.asyncio
async def test_a_payment_for_a_cancelled_event_is_refunded(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db)
    order_id = (await _order(await make_user(db_async), shop)).json()["id"]
    async with events_db() as events:
        await events.execute(
            update(Listing)
            .where(Listing.id == shop.listing_id)
            .values(status="cancelled")
        )
        await events.commit()
    await _pay_by_hand(db_async, shop, order_id)
    await _drain(db_async)
    assert await _tickets(events_db, order_id) == []
    order = await _row(events_db, order_id)
    assert (order.status, order.refunded_minor) == ("expired", PRICE)


# --- refunds ---------------------------------------------------------------------------------


async def _paid_order(db: AsyncSession, shop: Shop, quantity: int = 2) -> str:
    order_id = (await _order(await make_user(db), shop, quantity)).json()["id"]
    await _pay_by_hand(db, shop, order_id)
    await _drain(db)
    return order_id


@pytest.mark.asyncio
async def test_a_refund_cancels_the_tickets_once(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, allocation=2)
    order_id = await _paid_order(db_async, shop, 2)
    assert await _remaining(events_db, shop) == 0
    intent = await _intent(db_async, order_id)
    assert intent is not None

    await payments_service.refund_intent(
        db_async,
        organisation_id=shop.organisation_id,
        intent_id=intent.id,
        actor=None,
        payload=payment_schemas.PaymentRefundCreate(reason="Buyer asked"),
    )
    await db_async.commit()
    assert await _drain(db_async) >= 1
    tickets = await _tickets(events_db, order_id)
    assert {t.status for t in tickets} == {"refunded"}
    assert all(t.cancelled_at is not None for t in tickets)
    order = await _row(events_db, order_id)
    assert order.status == "refunded"
    assert order.refunded_minor == 2 * PRICE
    assert await _remaining(events_db, shop) == 2  # the seats are free again

    # Delivered again: nothing is cancelled a second time.
    outcome = await order_fulfilment.apply_refund(
        db_async,
        organisation_id=shop.organisation_id,
        order_id=uuid.UUID(order_id),
    )
    assert outcome == "duplicate"
    assert await _drain(db_async) == 0
    assert {t.status for t in await _tickets(events_db, order_id)} == {"refunded"}


@pytest.mark.asyncio
async def test_a_partial_refund_keeps_the_tickets(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db)
    order_id = await _paid_order(db_async, shop, 2)
    intent = await _intent(db_async, order_id)
    assert intent is not None
    await payments_service.refund_intent(
        db_async,
        organisation_id=shop.organisation_id,
        intent_id=intent.id,
        actor=None,
        payload=payment_schemas.PaymentRefundCreate(
            amount_minor=PRICE, reason="Goodwill"
        ),
    )
    await db_async.commit()
    await _drain(db_async)
    assert {t.status for t in await _tickets(events_db, order_id)} == {"valid"}
    order = await _row(events_db, order_id)
    assert (order.status, order.refunded_minor) == ("confirmed", PRICE)


# --- settlement and rewards -----------------------------------------------------------


@pytest.mark.asyncio
async def test_settlement_reconciles_online_orders_with_the_ledger(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop(db_async, events_db, allocation=10)
    paid = await _paid_order(db_async, shop, 2)
    refunded = await _paid_order(db_async, shop, 1)
    pending = (await _order(await make_user(db_async), shop, 3)).json()["id"]
    intent = await _intent(db_async, refunded)
    assert intent is not None
    await payments_service.refund_intent(
        db_async,
        organisation_id=shop.organisation_id,
        intent_id=intent.id,
        actor=None,
        payload=payment_schemas.PaymentRefundCreate(reason="Buyer asked"),
    )
    await db_async.commit()
    await _drain(db_async)
    assert pending and paid

    async with events_db() as events:
        report = await events_service.settlement(
            events, shop.owner, shop.listing_id, [shop.organisation_id], None
        )
        csv_text = await events_service.settlement_csv(
            events, shop.owner, shop.listing_id, [shop.organisation_id], None
        )
    online = report.online_payments
    assert online is not None
    assert online.orders_paid == 2
    assert (online.orders_pending, online.pending_minor) == (1, 3 * PRICE)
    assert (online.collected_minor, online.refunded_minor) == (3 * PRICE, PRICE)
    assert (online.ledger_collected_minor, online.ledger_refunded_minor) == (
        3 * PRICE,
        PRICE,
    )
    assert online.reconciled is True
    assert report.discrepancies == []
    channel = next(c for c in report.channels if c.channel == "online")
    assert (channel.collected_minor, channel.refunded_minor) == (3 * PRICE, PRICE)
    assert (channel.claimed, channel.refunded) == (2, 1)
    assert "Online payments" in csv_text
    assert "tickets by channel".lower() in csv_text.lower()

    # A ledger that disagrees is listed, not netted away.
    async with events_db() as events:
        await events.execute(
            update(Order)
            .where(Order.id == uuid.UUID(paid))
            .values(collected_minor=PRICE)
        )
        await events.commit()
        broken = await events_service.settlement(
            events, shop.owner, shop.listing_id, [shop.organisation_id], None
        )
        overview = await events_service.organiser_settlement(
            events, shop.owner, [shop.organisation_id], None
        )
    assert broken.online_payments is not None
    assert broken.online_payments.reconciled is False
    assert [i.kind for i in broken.discrepancies] == ["online_ledger_mismatch"]
    assert overview.listings[0].online_collected_minor == 2 * PRICE
    assert overview.listings[0].issues == 1
