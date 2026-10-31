# ruff: noqa: ARG001  (pytest fixtures requested for their side effects)
"""The daily refund reconciliation job against Stripe's full refund list (#869).

A ``charge.refunded`` webhook lists at most ten refunds (``has_more`` marks the
rest), and the webhook path never guesses the missing ones from the total. The
job lists every refund of the payment through the Stripe API, page by page, and
reconciles each one by our refund id, then by Stripe's refund id. Running it twice
changes nothing the second time. A fake Stripe over ``httpx.MockTransport`` stands in
for the API; only ``sk_test_`` keys are ever used.
"""

import uuid
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any
from unittest.mock import MagicMock

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.payments import schemas, service
from src.payments.config import payments_settings
from src.payments.exceptions import ProviderRequestError, ProviderUnavailableError
from src.payments.models import Intent, LedgerEntry, LedgerKind, Refund, RefundStatus
from src.payments.providers import registry
from src.payments.providers import stripe as stripe_module
from src.utils.datetime import utc_now
from src.worker import main as worker_main
from tests.payments.conftest import (
    StripeStub,
    charge_refunded,
    checkout_completed,
    provider_refund,
    signed,
)
from tests.payments.test_payments import API, _create, _org, _stripe_intent

pytestmark = pytest.mark.asyncio

WEBHOOK = f"{API}/public/webhooks/stripe"
PAID = 5000
PAYMENT = "pi_test_check"


@dataclass
class FakeStripe:
    """Stripe's refund API for one test: refunds per payment intent, newest first."""

    refunds: dict[str, list[dict[str, Any]]] = field(default_factory=dict)
    requests: list[httpx.Request] = field(default_factory=list)
    fail_listing: bool = False
    #: Payments Stripe no longer knows (a purged test payment): listing is a 404.
    gone: set[str] = field(default_factory=set)
    sessions: int = 0

    def add(
        self,
        payment_intent: str,
        amount: int,
        *,
        refund_id: object | None = None,
        status: str = "succeeded",
        listed_under: str | None = None,
        currency: str = "xcd",
    ) -> dict[str, Any]:
        """A refund on ``payment_intent``. ``listed_under`` files it under another
        payment's listing (a provider echo that does not match)."""
        listed = self.refunds.setdefault(listed_under or payment_intent, [])
        refund = provider_refund(
            f"re_{len(listed) + 1:04d}", amount, refund_id=refund_id, status=status
        )
        refund["payment_intent"] = payment_intent
        refund["currency"] = currency
        listed.insert(0, refund)
        return refund

    def listing_requests(self) -> list[httpx.Request]:
        return [
            r
            for r in self.requests
            if r.method == "GET" and r.url.path == "/v1/refunds"
        ]

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        path = request.url.path
        if request.method == "POST" and path == "/v1/checkout/sessions":
            self.sessions += 1
            session_id = f"cs_test_check_{self.sessions}"
            return httpx.Response(
                200,
                json={
                    "id": session_id,
                    "url": f"https://checkout.stripe.com/c/{session_id}",
                },
            )
        if request.method == "POST" and path == "/v1/refunds":
            form = dict(httpx.QueryParams(request.content.decode()))
            refund = self.add(
                form["payment_intent"],
                int(form["amount"]),
                refund_id=form.get("metadata[refund_id]"),
            )
            return httpx.Response(200, json=refund)
        if request.method == "GET" and path == "/v1/refunds":
            params = request.url.params
            if self.fail_listing:
                return httpx.Response(500, json={"error": {"message": "down"}})
            if params["payment_intent"] in self.gone:
                return httpx.Response(404, json={"error": {"message": "No such"}})
            listed = self.refunds.get(params["payment_intent"], [])
            start = 0
            if "starting_after" in params:
                ids = [refund["id"] for refund in listed]
                start = ids.index(params["starting_after"]) + 1
            limit = int(params.get("limit", "10"))
            page = listed[start : start + limit]
            return httpx.Response(
                200,
                json={
                    "object": "list",
                    "data": page,
                    "has_more": start + limit < len(listed),
                },
            )
        return httpx.Response(404, json={})


@pytest.fixture
def fake_stripe(stripe_env: StripeStub, monkeypatch: pytest.MonkeyPatch) -> FakeStripe:
    """Test-mode Stripe settings from ``stripe_env``, with this fake answering."""
    fake = FakeStripe()
    monkeypatch.setattr(stripe_module, "_transport", httpx.MockTransport(fake.handler))
    return fake


async def _captured(
    client: httpx.AsyncClient, db: AsyncSession, payment_intent: str = PAYMENT
) -> tuple[str, str]:
    org, admin = await _org(db)
    intent_id = await _stripe_intent(client, org, admin)
    event = checkout_completed(
        intent_id,
        event_id=f"evt_paid_{payment_intent}",
        amount=PAID,
        payment_intent=payment_intent,
    )
    # One checkout session per payment, so the webhook names only this one.
    event["data"]["object"]["id"] = (await _intent(db, intent_id)).provider_ref
    body, headers = signed(event)
    assert (
        await client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200
    return org.id, intent_id


async def _rows(db: AsyncSession, intent_id: str) -> list[Refund]:
    return list(
        await db.scalars(
            select(Refund)
            .where(Refund.intent_id == uuid.UUID(intent_id))
            .order_by(Refund.provider_ref)
            .execution_options(populate_existing=True)
        )
    )


async def _refund_ledger(db: AsyncSession, intent_id: str) -> list[int]:
    return list(
        await db.scalars(
            select(LedgerEntry.amount_minor).where(
                LedgerEntry.intent_id == uuid.UUID(intent_id),
                LedgerEntry.kind == LedgerKind.REFUND.value,
            )
        )
    )


async def _intent(db: AsyncSession, intent_id: str) -> Intent:
    intent = await db.scalar(
        select(Intent)
        .where(Intent.id == uuid.UUID(intent_id))
        .execution_options(populate_existing=True)
    )
    assert intent is not None
    return intent


# --- the Stripe adapter's listing ----------------------------------------------------


async def test_the_listing_follows_has_more_page_by_page(
    async_client: httpx.AsyncClient, db_async: AsyncSession, fake_stripe: FakeStripe
) -> None:
    _, intent_id = await _captured(async_client, db_async)
    for _ in range(250):
        fake_stripe.add(PAYMENT, 1)
    listing = await registry.get_provider("stripe").list_refunds(
        await _intent(db_async, intent_id)
    )
    assert listing.complete
    assert len(listing.refunds) == 250
    assert len({refund.provider_ref for refund in listing.refunds}) == 250
    pages = fake_stripe.listing_requests()
    assert [page.url.params.get("starting_after") for page in pages] == [
        None,
        "re_0151",
        "re_0051",
    ]
    assert {page.url.params["payment_intent"] for page in pages} == {PAYMENT}
    assert {page.url.params["limit"] for page in pages} == {"100"}


async def test_a_listing_past_the_page_limit_is_reported_incomplete(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_stripe: FakeStripe,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, intent_id = await _captured(async_client, db_async)
    for _ in range(250):
        fake_stripe.add(PAYMENT, 1)
    monkeypatch.setattr(stripe_module, "REFUND_MAX_PAGES", 2)
    listing = await registry.get_provider("stripe").list_refunds(
        await _intent(db_async, intent_id)
    )
    assert not listing.complete
    assert len(listing.refunds) == 200


async def test_more_pages_without_a_cursor_is_an_error_not_a_loop(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    stripe_env: StripeStub,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, intent_id = await _captured(async_client, db_async)
    calls: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        return httpx.Response(200, json={"data": [], "has_more": True})

    monkeypatch.setattr(stripe_module, "_transport", httpx.MockTransport(handler))
    with pytest.raises(ProviderRequestError):
        await registry.get_provider("stripe").list_refunds(
            await _intent(db_async, intent_id)
        )
    assert len(calls) == 1


async def test_a_live_key_lists_nothing(
    fake_stripe: FakeStripe, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(payments_settings, "STRIPE_SECRET_KEY", "sk_live_nope")
    with pytest.raises(ProviderUnavailableError):
        registry.get_provider("stripe")
    assert fake_stripe.requests == []


# --- reconciliation ---------------------------------------------------------------------


async def test_refunds_beyond_a_truncated_webhook_list_are_recorded_once(
    async_client: httpx.AsyncClient, db_async: AsyncSession, fake_stripe: FakeStripe
) -> None:
    _, intent_id = await _captured(async_client, db_async)
    for _ in range(12):
        fake_stripe.add(PAYMENT, 100)
    newest_ten = fake_stripe.refunds[PAYMENT][:10]
    body, headers = signed(
        charge_refunded(
            "evt_twelve",
            amount_refunded=1200,
            refunds=newest_ten,
            has_more=True,
            payment_intent=PAYMENT,
        )
    )
    assert (
        await async_client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200
    assert len(await _rows(db_async, intent_id)) == 10

    check = await service.reconcile_refunds(db_async, uuid.UUID(intent_id))
    assert check is not None
    assert check.changed and check.complete and not check.mismatch
    rows = await _rows(db_async, intent_id)
    assert [row.provider_ref for row in rows] == [f"re_{n:04d}" for n in range(1, 13)]
    assert sorted(await _refund_ledger(db_async, intent_id)) == [-100] * 12

    again = await service.reconcile_refunds(db_async, uuid.UUID(intent_id))
    assert again is not None
    assert not again.changed and not again.mismatch
    assert len(await _rows(db_async, intent_id)) == 12
    assert len(await _refund_ledger(db_async, intent_id)) == 12


async def test_our_own_refund_is_matched_by_our_id_and_not_recorded_twice(
    async_client: httpx.AsyncClient, db_async: AsyncSession, fake_stripe: FakeStripe
) -> None:
    org_id, intent_id = await _captured(async_client, db_async)
    made = await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=schemas.PaymentRefundCreate(amount_minor=2000, reason="Partial"),
    )
    await db_async.commit()

    check = await service.reconcile_refunds(db_async, uuid.UUID(intent_id))
    assert check is not None
    assert not check.changed and not check.mismatch
    rows = await _rows(db_async, intent_id)
    assert [(row.id, row.amount_minor) for row in rows] == [(made.id, 2000)]
    assert await _refund_ledger(db_async, intent_id) == [-2000]


async def test_a_refund_lost_before_commit_is_recorded_under_our_id_then_the_retry_counts_once(
    async_client: httpx.AsyncClient, db_async: AsyncSession, fake_stripe: FakeStripe
) -> None:
    org_id, intent_id = await _captured(async_client, db_async)
    refund_id = uuid.uuid4()
    payload = schemas.PaymentRefundCreate(amount_minor=1500, reason="Partial")
    await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=payload,
        refund_id=refund_id,
    )
    await db_async.rollback()  # Stripe refunded; our transaction was lost.
    assert await _rows(db_async, intent_id) == []

    check = await service.reconcile_refunds(db_async, uuid.UUID(intent_id))
    assert check is not None and check.changed and not check.mismatch
    assert [row.id for row in await _rows(db_async, intent_id)] == [refund_id]

    retried = await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=payload,
        refund_id=refund_id,
    )
    await db_async.commit()
    assert retried.id == refund_id
    assert len(fake_stripe.refunds[PAYMENT]) == 1
    assert await _refund_ledger(db_async, intent_id) == [-1500]


async def test_a_pending_refund_the_provider_settled_moves_to_succeeded(
    async_client: httpx.AsyncClient, db_async: AsyncSession, fake_stripe: FakeStripe
) -> None:
    org_id, intent_id = await _captured(async_client, db_async)
    made = await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=schemas.PaymentRefundCreate(amount_minor=700, reason="Partial"),
    )
    await db_async.commit()
    row = await db_async.get(Refund, made.id)
    assert row is not None
    row.status = RefundStatus.PENDING.value
    await db_async.commit()

    check = await service.reconcile_refunds(db_async, uuid.UUID(intent_id))
    assert check is not None and check.changed and not check.mismatch
    assert [r.status for r in await _rows(db_async, intent_id)] == ["succeeded"]


async def test_a_settled_refund_the_provider_lists_as_failed_is_alerted_not_moved(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_stripe: FakeStripe,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    org_id, intent_id = await _captured(async_client, db_async)
    await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=schemas.PaymentRefundCreate(amount_minor=1000, reason="Partial"),
    )
    await db_async.commit()
    fake_stripe.refunds[PAYMENT][0]["status"] = "failed"

    log = MagicMock()
    monkeypatch.setattr(service, "logger", log)
    check = await service.reconcile_refunds(db_async, uuid.UUID(intent_id))
    assert check is not None and check.mismatch
    messages = [call.args[0] for call in log.error.call_args_list]
    assert any("refund reconciliation mismatch" in m for m in messages)
    # Settled money is never moved back by a later report.
    assert [r.status for r in await _rows(db_async, intent_id)] == ["succeeded"]


async def test_a_recorded_refund_the_provider_does_not_list_is_alerted_after_the_grace(
    async_client: httpx.AsyncClient, db_async: AsyncSession, fake_stripe: FakeStripe
) -> None:
    org_id, intent_id = await _captured(async_client, db_async)
    await service.refund_intent(
        db_async,
        organisation_id=org_id,
        intent_id=uuid.UUID(intent_id),
        actor=None,
        payload=schemas.PaymentRefundCreate(amount_minor=1000, reason="Partial"),
    )
    await db_async.commit()
    fake_stripe.refunds[PAYMENT].clear()

    soon = await service.reconcile_refunds(db_async, uuid.UUID(intent_id))
    assert soon is not None and not soon.mismatch

    later = await service.reconcile_refunds(
        db_async,
        uuid.UUID(intent_id),
        now=utc_now() + service.REFUND_CHECK_GRACE + timedelta(minutes=1),
    )
    assert later is not None and later.mismatch
    assert len(await _rows(db_async, intent_id)) == 1


async def test_a_manual_payment_is_not_a_candidate(
    async_client: httpx.AsyncClient, db_async: AsyncSession, fake_stripe: FakeStripe
) -> None:
    org, admin = await _org(db_async)
    manual = await _create(async_client, org, admin)
    _, card = await _captured(async_client, db_async)
    candidates = await service.refund_check_candidates(
        db_async, since=utc_now() - timedelta(days=1), limit=10
    )
    assert uuid.UUID(card) in candidates
    assert uuid.UUID(manual["intent"]["id"]) not in candidates
    assert (
        await service.reconcile_refunds(db_async, uuid.UUID(manual["intent"]["id"]))
        is None
    )


async def test_the_daily_run_reconciles_and_counts(
    async_client: httpx.AsyncClient, db_async: AsyncSession, fake_stripe: FakeStripe
) -> None:
    _, first = await _captured(async_client, db_async, "pi_first")
    _, second = await _captured(async_client, db_async, "pi_second")
    fake_stripe.add("pi_first", 300)

    run = await service.reconcile_recent_refunds(db_async)
    assert (run.checked, run.changed, run.mismatched, run.failed) == (2, 1, 0, 0)
    assert [r.amount_minor for r in await _rows(db_async, first)] == [300]
    assert await _rows(db_async, second) == []

    again = await service.reconcile_recent_refunds(db_async)
    assert (again.checked, again.changed) == (2, 0)


async def test_the_daily_run_counts_a_provider_failure_and_goes_on(
    async_client: httpx.AsyncClient, db_async: AsyncSession, fake_stripe: FakeStripe
) -> None:
    await _captured(async_client, db_async)
    fake_stripe.fail_listing = True
    run = await service.reconcile_recent_refunds(db_async)
    assert (run.checked, run.failed, run.provider_off) == (0, 1, False)


async def test_the_daily_run_does_nothing_while_stripe_is_off(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_stripe: FakeStripe,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _captured(async_client, db_async)
    before = len(fake_stripe.requests)
    monkeypatch.setattr(payments_settings, "STRIPE_SECRET_KEY", None)
    run = await service.reconcile_recent_refunds(db_async)
    assert run.provider_off and run.checked == 0
    assert len(fake_stripe.requests) == before


async def test_the_daily_run_skips_payments_older_than_the_window(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_stripe: FakeStripe,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _captured(async_client, db_async)
    monkeypatch.setattr(payments_settings, "REFUND_RECONCILE_WINDOW_DAYS", 1)
    run = await service.reconcile_recent_refunds(
        db_async, now=utc_now() + timedelta(days=2)
    )
    assert run.checked == 0
    assert fake_stripe.listing_requests() == []


def test_the_job_is_registered_and_scheduled_daily() -> None:
    assert (
        worker_main.reconcile_provider_refunds in worker_main.WorkerSettings.functions
    )
    jobs = [
        job
        for job in worker_main.WorkerSettings.cron_jobs
        if job.coroutine is worker_main.reconcile_provider_refunds
    ]
    assert len(jobs) == 1
    assert jobs[0].hour == 4 and jobs[0].minute == 40


# --- review follow-ups: legacy rows, isolation, echoes, budget, rotation ---------------


async def _legacy_dashboard_refund(
    client: httpx.AsyncClient, fake: FakeStripe, amount: int
) -> None:
    """A dashboard refund recorded by the old total path: a complete but empty
    refund list, so the remainder is written with no provider refund id."""
    fake.add(PAYMENT, amount)
    body, headers = signed(
        charge_refunded(
            "evt_legacy_total",
            amount_refunded=amount,
            refunds=[],
            payment_intent=PAYMENT,
        )
    )
    assert (
        await client.post(WEBHOOK, content=body, headers=headers)
    ).status_code == 200


async def test_a_legacy_row_without_a_provider_id_blocks_every_write(
    async_client: httpx.AsyncClient, db_async: AsyncSession, fake_stripe: FakeStripe
) -> None:
    _, intent_id = await _captured(async_client, db_async)
    await _legacy_dashboard_refund(async_client, fake_stripe, 500)
    rows = await _rows(db_async, intent_id)
    assert [(r.amount_minor, r.provider_ref) for r in rows] == [(500, None)]

    run = await service.reconcile_recent_refunds(db_async)
    assert (run.checked, run.changed, run.skipped_legacy, run.mismatched) == (
        1,
        0,
        1,
        0,
    )
    # Stripe's copy of the same refund was not recorded a second time.
    assert [
        (r.amount_minor, r.provider_ref) for r in await _rows(db_async, intent_id)
    ] == [(500, None)]
    assert await _refund_ledger(db_async, intent_id) == [-500]


async def test_a_mixed_payment_writes_nothing_but_still_alerts_on_totals(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_stripe: FakeStripe,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, intent_id = await _captured(async_client, db_async)
    await _legacy_dashboard_refund(async_client, fake_stripe, 500)
    fake_stripe.add(PAYMENT, 300)  # A refund we never recorded.
    log = MagicMock()
    monkeypatch.setattr(service, "logger", log)

    check = await service.reconcile_refunds(db_async, uuid.UUID(intent_id))
    assert check is not None
    assert check.skipped_legacy and not check.changed and check.mismatch
    assert len(await _rows(db_async, intent_id)) == 1
    assert await _refund_ledger(db_async, intent_id) == [-500]
    warning = log.warning.call_args_list[0]
    assert warning.kwargs["extra"]["intent_id"] == intent_id
    assert len(warning.kwargs["extra"]["refund_ids"]) == 1


async def test_one_failing_payment_does_not_stop_the_run(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_stripe: FakeStripe,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, broken = await _captured(async_client, db_async, "pi_broken")
    _, healthy = await _captured(async_client, db_async, "pi_healthy")
    fake_stripe.add("pi_broken", 100)
    fake_stripe.add("pi_healthy", 200)
    real = service._reconcile_listed_refund

    async def flaky(
        session: AsyncSession, intent: Intent, *args: Any, **kwargs: Any
    ) -> bool:
        if str(intent.id) == broken:
            await real(session, intent, *args, **kwargs)
            raise IntegrityError("INSERT", {}, Exception("duplicate key"))
        return await real(session, intent, *args, **kwargs)

    monkeypatch.setattr(service, "_reconcile_listed_refund", flaky)
    run = await service.reconcile_recent_refunds(db_async)
    assert (run.checked, run.changed, run.failed) == (1, 1, 1)
    # The failing payment's half-written refund was rolled back.
    assert await _rows(db_async, broken) == []
    # Stamped all the same, so it waits its turn instead of leading every run.
    assert (await _intent(db_async, broken)).refunds_checked_at is not None
    assert [r.amount_minor for r in await _rows(db_async, healthy)] == [200]


async def test_a_listed_refund_for_another_payment_or_currency_is_skipped(
    async_client: httpx.AsyncClient, db_async: AsyncSession, fake_stripe: FakeStripe
) -> None:
    _, intent_id = await _captured(async_client, db_async)
    fake_stripe.add(PAYMENT, 100)
    fake_stripe.add("pi_someone_else", 200, listed_under=PAYMENT)
    fake_stripe.add(PAYMENT, 300, currency="usd")
    listing = await registry.get_provider("stripe").list_refunds(
        await _intent(db_async, intent_id)
    )
    assert [refund.amount_minor for refund in listing.refunds] == [100]

    check = await service.reconcile_refunds(db_async, uuid.UUID(intent_id))
    assert check is not None and check.changed
    assert [r.amount_minor for r in await _rows(db_async, intent_id)] == [100]


async def test_the_run_stops_at_its_time_budget_and_says_so(
    async_client: httpx.AsyncClient, db_async: AsyncSession, fake_stripe: FakeStripe
) -> None:
    await _captured(async_client, db_async, "pi_one")
    await _captured(async_client, db_async, "pi_two")
    ticks = iter([0.0, 0.0, 1000.0])
    run = await service.reconcile_recent_refunds(db_async, clock=lambda: next(ticks))
    assert run.partial
    assert run.checked == 1
    assert len(fake_stripe.listing_requests()) == 1


async def test_the_run_uses_one_http_client(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_stripe: FakeStripe,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    await _captured(async_client, db_async, "pi_one")
    await _captured(async_client, db_async, "pi_two")
    opened: list[httpx.AsyncClient] = []
    real = stripe_module.StripeProvider._new_client

    def counting(self: stripe_module.StripeProvider) -> httpx.AsyncClient:
        client = real(self)
        opened.append(client)
        return client

    monkeypatch.setattr(stripe_module.StripeProvider, "_new_client", counting)
    run = await service.reconcile_recent_refunds(db_async)
    assert run.checked == 2
    assert len(opened) == 1
    assert len(fake_stripe.listing_requests()) == 2


async def test_every_payment_in_the_window_is_reached_in_turn(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_stripe: FakeStripe,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payments = ["pi_a", "pi_b", "pi_c"]
    ids = [(await _captured(async_client, db_async, p))[1] for p in payments]
    before = {i: (await _intent(db_async, i)).updated_at for i in ids}
    monkeypatch.setattr(payments_settings, "REFUND_RECONCILE_BATCH", 1)
    start = utc_now()
    for day in range(3):
        run = await service.reconcile_recent_refunds(
            db_async, now=start + timedelta(minutes=day)
        )
        assert run.checked == 1
    listed = [r.url.params["payment_intent"] for r in fake_stripe.listing_requests()]
    assert sorted(listed) == payments
    for intent_id in ids:
        intent = await _intent(db_async, intent_id)
        assert intent.refunds_checked_at is not None
        # The stamp is bookkeeping: the payment's own updated_at is unchanged.
        assert intent.updated_at == before[intent_id]
    # The fourth run goes back to the one checked longest ago.
    await service.reconcile_recent_refunds(db_async, now=start + timedelta(minutes=3))
    assert fake_stripe.listing_requests()[-1].url.params["payment_intent"] == listed[0]


async def test_a_payment_that_always_fails_goes_to_the_back_of_the_queue(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_stripe: FakeStripe,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, healthy = await _captured(async_client, db_async, "pi_healthy")
    _, gone = await _captured(async_client, db_async, "pi_gone")  # newest: first
    fake_stripe.gone.add("pi_gone")
    monkeypatch.setattr(payments_settings, "REFUND_RECONCILE_BATCH", 1)
    start = utc_now()

    first = await service.reconcile_recent_refunds(db_async, now=start)
    assert (first.checked, first.failed) == (0, 1)
    assert (await _intent(db_async, gone)).refunds_checked_at is not None

    second = await service.reconcile_recent_refunds(
        db_async, now=start + timedelta(minutes=1)
    )
    assert (second.checked, second.failed) == (1, 0)
    listed = [r.url.params["payment_intent"] for r in fake_stripe.listing_requests()]
    assert listed == ["pi_gone", "pi_healthy"]
    assert (await _intent(db_async, healthy)).refunds_checked_at is not None


async def test_a_listing_stops_paging_near_the_end_of_the_run_budget(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    fake_stripe: FakeStripe,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Under 20 s of the run's 240 s left before a further page: the listing ends
    there, incomplete, so what was listed is reconciled but totals are not compared."""
    _, intent_id = await _captured(async_client, db_async)
    for _ in range(250):
        fake_stripe.add(PAYMENT, 1)
    log = MagicMock()
    monkeypatch.setattr(service, "logger", log)
    ticks = iter([0.0, 0.0])

    def clock() -> float:
        return next(ticks, 225.0)  # 15 s left once the first page is in

    run = await service.reconcile_recent_refunds(db_async, clock=clock)
    assert (run.checked, run.changed, run.mismatched) == (1, 1, 0)
    assert len(fake_stripe.listing_requests()) == 1
    assert len(await _rows(db_async, intent_id)) == 100
    errors = [call.args[0] for call in log.error.call_args_list]
    assert any("listing incomplete" in message for message in errors)
    assert not any("mismatch" in message for message in errors)
