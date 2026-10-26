"""Invoicing (P1-P3): totals, numbering, status machine, payments, reminders, access, audit."""

import asyncio
import uuid
from datetime import date, timedelta
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.billing import calc, invoices, reminders
from src.billing.models import InvoiceReminder, ReminderStage
from src.billing.schemas import InvoiceDraftWrite, InvoiceLineInput
from src.database import async_session_factory
from src.notifications.models import OutboundEmail
from tests.factories import assign_role, make_role_with_permission, make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/billing"
TODAY = invoices.today_grenada()


@pytest.fixture(autouse=True)
def _frozen_grenada_today(monkeypatch: pytest.MonkeyPatch) -> None:
    """Pin the API's notion of today to TODAY so a run crossing Grenada midnight stays consistent."""
    monkeypatch.setattr(invoices, "today_grenada", lambda: TODAY)
    monkeypatch.setattr(reminders, "today_grenada", lambda: TODAY)


async def _customer(
    client: httpx.AsyncClient, headers: dict[str, str], db: AsyncSession, name: str
) -> dict:
    org = await make_org(db, name)
    resp = await client.post(
        f"{API}/customers",
        headers=headers,
        json={
            "organisation_id": org.id,
            "billing_email": "accounts@example.com",
            "address": "1 Carenage Road\nSt George's",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _draft(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    customer_id: str,
    lines: list[dict] | None = None,
) -> dict:
    resp = await client.post(
        f"{API}/invoices",
        headers=headers,
        json={
            "customer_id": customer_id,
            "notes": "Net 30",
            "lines": lines
            or [
                {
                    "description": "Monitoring service",
                    "quantity": 1,
                    "unit_price_minor": 100_000,
                }
            ],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _issued(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    customer_id: str,
    *,
    issue_date: date | None = None,
    lines: list[dict] | None = None,
) -> dict:
    draft = await _draft(client, headers, customer_id, lines)
    resp = await client.post(
        f"{API}/invoices/{draft['id']}/issue",
        headers=headers,
        json={"issue_date": (issue_date or TODAY).isoformat()},
    )
    assert resp.status_code == 200, resp.text
    return resp.json()


# --- Arithmetic ---------------------------------------------------------------------


def test_line_totals_round_half_up_per_line() -> None:
    # 3 x 3.335 = 10.005 -> 1001 minor (half-up), 15% of 1001 = 150.15 -> 150
    totals = calc.line_totals(Decimal("3"), 334, Decimal("15"))
    assert totals.subtotal_minor == 1002
    assert totals.tax_minor == 150
    # 0.5 minor rounds up, not to even
    assert calc.line_totals(Decimal("1"), 1, Decimal("50")).tax_minor == 1
    assert calc.line_totals(Decimal("0.5"), 1, Decimal("0")).subtotal_minor == 1
    assert calc.line_totals(Decimal("2.5"), 1, Decimal("0")).subtotal_minor == 3


def test_tax_rate_zero_and_fractional_quantity() -> None:
    totals = calc.line_totals(Decimal("1.333"), 10_000, Decimal("0"))
    assert (totals.subtotal_minor, totals.tax_minor) == (13_330, 0)


def test_ageing_buckets_and_reminder_stages() -> None:
    from src.billing.invoices import bucket_for

    assert [bucket_for(d).value for d in (-5, 0, 1, 30, 31, 60, 61, 90, 91)] == [
        "current",
        "current",
        "days_1_30",
        "days_1_30",
        "days_31_60",
        "days_31_60",
        "days_61_90",
        "days_61_90",
        "over_90",
    ]
    due = date(2026, 11, 20)
    stage = calc.due_reminder_stage
    assert stage(due, due - timedelta(days=8), 2) is None
    assert stage(due, due - timedelta(days=7), 2) is ReminderStage.BEFORE_DUE_7
    assert stage(due, due - timedelta(days=5), 2) is ReminderStage.BEFORE_DUE_7
    assert stage(due, due - timedelta(days=4), 2) is None
    assert stage(due, due, 2) is ReminderStage.DUE_TODAY
    assert stage(due, due + timedelta(days=3), 2) is None
    assert stage(due, due + timedelta(days=7), 2) is ReminderStage.OVERDUE_7
    assert stage(due, due + timedelta(days=10), 2) is None


# --- Totals through the API -------------------------------------------------------


async def test_draft_totals_use_default_vat_and_per_line_rounding(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    customer = await _customer(
        async_client, superuser_token_headers_async, db_async, "Totals Co"
    )
    draft = await _draft(
        async_client,
        superuser_token_headers_async,
        customer["id"],
        [
            {"description": "A", "quantity": 3, "unit_price_minor": 334},
            {
                "description": "B",
                "quantity": 2.5,
                "unit_price_minor": 1001,
                "tax_rate": 0,
            },
        ],
    )
    assert draft["status"] == "draft"
    assert draft["number"] is None
    lines = draft["lines"]
    assert [line["tax_rate"] for line in lines] == [15.0, 0.0]
    assert (lines[0]["subtotal_minor"], lines[0]["tax_minor"]) == (1002, 150)
    assert (lines[1]["subtotal_minor"], lines[1]["tax_minor"]) == (2503, 0)
    assert draft["subtotal_minor"] == 3505
    assert draft["tax_minor"] == 150
    assert draft["total_minor"] == 3655
    assert draft["currency"] == "XCD"


async def test_invalid_line_precision_is_rejected(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    customer = await _customer(
        async_client, superuser_token_headers_async, db_async, "Precision Co"
    )
    resp = await async_client.post(
        f"{API}/invoices",
        headers=superuser_token_headers_async,
        json={
            "customer_id": customer["id"],
            "lines": [{"description": "x", "quantity": 1.2345, "unit_price_minor": 1}],
        },
    )
    assert resp.status_code == 422


async def test_draft_can_be_replaced_and_deleted_but_issued_is_immutable(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    customer = await _customer(async_client, headers, db_async, "Edit Co")
    draft = await _draft(async_client, headers, customer["id"])
    body = {
        "customer_id": customer["id"],
        "notes": "Changed",
        "lines": [
            {
                "description": "New",
                "quantity": 2,
                "unit_price_minor": 5000,
                "tax_rate": 10,
            }
        ],
    }
    resp = await async_client.put(
        f"{API}/invoices/{draft['id']}", headers=headers, json=body
    )
    assert resp.status_code == 200
    assert resp.json()["total_minor"] == 11_000
    assert len(resp.json()["lines"]) == 1

    other = await _draft(async_client, headers, customer["id"])
    assert (
        await async_client.delete(f"{API}/invoices/{other['id']}", headers=headers)
    ).status_code == 204
    assert (
        await async_client.get(f"{API}/invoices/{other['id']}", headers=headers)
    ).status_code == 404

    issued = await _issued(async_client, headers, customer["id"])
    assert (
        await async_client.put(
            f"{API}/invoices/{issued['id']}", headers=headers, json=body
        )
    ).status_code == 409
    assert (
        await async_client.delete(f"{API}/invoices/{issued['id']}", headers=headers)
    ).status_code == 409


# --- Issue and numbering ------------------------------------------------------------


async def test_issue_assigns_number_dates_pdf_and_queues_email(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    customer = await _customer(async_client, headers, db_async, "Issue Co")
    issued = await _issued(
        async_client, headers, customer["id"], issue_date=date(2031, 3, 1)
    )
    assert issued["number"] == "BG-2031-0001"
    assert issued["status"] == "issued"
    assert issued["issue_date"] == "2031-03-01"
    assert issued["due_date"] == "2031-03-31"
    assert issued["legal_entity_name"] == "Barrels Grenada"
    assert issued["outstanding_minor"] == issued["total_minor"] == 115_000

    emails = (await db_async.scalars(select(OutboundEmail))).all()
    assert len(emails) == 1
    assert emails[0].to_email == "accounts@example.com"
    assert "BG-2031-0001" in emails[0].subject
    assert emails[0].transactional is True
    assert emails[0].html is not None and "XCD 1,150.00" in emails[0].html

    pdf = await async_client.get(f"{API}/invoices/{issued['id']}/pdf", headers=headers)
    assert pdf.status_code == 200
    assert pdf.headers["content-type"] == "application/pdf"
    assert pdf.content.startswith(b"%PDF")
    assert "BG-2031-0001.pdf" in pdf.headers["content-disposition"]


async def test_issue_requires_lines_and_draft_status(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    customer = await _customer(async_client, headers, db_async, "Empty Co")
    empty = await async_client.post(
        f"{API}/invoices",
        headers=headers,
        json={"customer_id": customer["id"], "lines": []},
    )
    resp = await async_client.post(
        f"{API}/invoices/{empty.json()['id']}/issue", headers=headers
    )
    assert resp.status_code == 422

    issued = await _issued(async_client, headers, customer["id"])
    again = await async_client.post(
        f"{API}/invoices/{issued['id']}/issue", headers=headers
    )
    assert again.status_code == 409


async def test_numbers_are_gapless_and_unique_under_concurrency(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    actor = await make_user(db_async, superuser=True)
    customer = await _customer(async_client, headers, db_async, "Race Co")
    ids = [
        (await _draft(async_client, headers, customer["id"]))["id"] for _ in range(6)
    ]
    day = date(2032, 6, 1)

    async def issue_one(invoice_id: str) -> str:
        async with async_session_factory() as session:
            result = await invoices.issue(
                session, actor, uuid.UUID(invoice_id), issue_date=day
            )
            await session.commit()
            assert result.number is not None
            return result.number

    numbers = await asyncio.gather(*(issue_one(i) for i in ids))
    assert sorted(numbers) == [f"BG-2032-{n:04d}" for n in range(1, 7)]
    assert len(set(numbers)) == 6


async def test_rolled_back_issue_does_not_burn_a_number(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    actor = await make_user(db_async, superuser=True)
    customer = await _customer(async_client, headers, db_async, "Rollback Co")
    first = (await _draft(async_client, headers, customer["id"]))["id"]
    second = (await _draft(async_client, headers, customer["id"]))["id"]
    day = date(2033, 1, 10)

    async with async_session_factory() as session:
        result = await invoices.issue(session, actor, uuid.UUID(first), issue_date=day)
        assert result.number == "BG-2033-0001"
        await session.rollback()

    async with async_session_factory() as session:
        result = await invoices.issue(session, actor, uuid.UUID(second), issue_date=day)
        await session.commit()
    assert result.number == "BG-2033-0001"


async def test_numbering_restarts_each_year(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    customer = await _customer(async_client, headers, db_async, "Year Co")
    a = await _issued(
        async_client, headers, customer["id"], issue_date=date(2034, 12, 30)
    )
    b = await _issued(
        async_client, headers, customer["id"], issue_date=date(2035, 1, 2)
    )
    c = await _issued(
        async_client, headers, customer["id"], issue_date=date(2035, 1, 3)
    )
    assert [a["number"], b["number"], c["number"]] == [
        "BG-2034-0001",
        "BG-2035-0001",
        "BG-2035-0002",
    ]


# --- Void ---------------------------------------------------------------------------


async def test_void_requires_reason_blocks_paid_and_is_audited(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    customer = await _customer(async_client, headers, db_async, "Void Co")
    issued = await _issued(async_client, headers, customer["id"])
    url = f"{API}/invoices/{issued['id']}/void"

    assert (
        await async_client.post(url, headers=headers, json={"reason": ""})
    ).status_code == 422
    resp = await async_client.post(
        url, headers=headers, json={"reason": "Issued in error"}
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "void"
    assert resp.json()["void_reason"] == "Issued in error"
    assert resp.json()["outstanding_minor"] == 0
    assert (
        await async_client.post(url, headers=headers, json={"reason": "again"})
    ).status_code == 409

    entries = (
        await db_async.scalars(
            select(AuditEntry)
            .where(
                AuditEntry.entity_type == "billing_invoice",
                AuditEntry.entity_id == issued["id"],
                AuditEntry.action == "void",
            )
            .execution_options(populate_existing=True)
        )
    ).all()
    assert len(entries) == 1
    assert entries[0].changes[0]["new"] == "Issued in error"
    assert entries[0].actor_user_id is not None

    paid = await _issued(async_client, headers, customer["id"])
    await async_client.post(
        f"{API}/invoices/{paid['id']}/payments",
        headers=headers,
        json={"method": "cash", "amount_minor": 100, "paid_date": TODAY.isoformat()},
    )
    assert (
        await async_client.post(
            f"{API}/invoices/{paid['id']}/void",
            headers=headers,
            json={"reason": "Paid already"},
        )
    ).status_code == 409


# --- Payments -----------------------------------------------------------------------


async def test_partial_then_full_payment_and_overpayment_rejected(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    customer = await _customer(async_client, headers, db_async, "Pay Co")
    issued = await _issued(async_client, headers, customer["id"])  # 115_000
    url = f"{API}/invoices/{issued['id']}/payments"

    def pay(amount: int, method: str = "bank_transfer", day: date = TODAY):
        return async_client.post(
            url,
            headers=headers,
            json={
                "method": method,
                "reference": "TT-1",
                "amount_minor": amount,
                "paid_date": day.isoformat(),
            },
        )

    first = await pay(40_000)
    assert first.status_code == 201
    assert first.json()["status"] == "partially_paid"
    assert first.json()["paid_minor"] == 40_000
    assert first.json()["outstanding_minor"] == 75_000

    over = await pay(75_001)
    assert over.status_code == 422
    future = await pay(100, day=TODAY + timedelta(days=2))
    assert future.status_code == 422
    bad_method = await async_client.post(
        url,
        headers=headers,
        json={"method": "card", "amount_minor": 1, "paid_date": TODAY.isoformat()},
    )
    assert bad_method.status_code == 422
    zero = await pay(0)
    assert zero.status_code == 422

    final = await pay(75_000, method="cheque")
    assert final.status_code == 201
    body = final.json()
    assert body["status"] == "paid"
    assert body["outstanding_minor"] == 0
    assert [p["method"] for p in body["payments"]] == ["bank_transfer", "cheque"]

    assert (await pay(1)).status_code == 409  # already paid


async def test_draft_and_void_invoices_take_no_payments(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    customer = await _customer(async_client, headers, db_async, "NoPay Co")
    draft = await _draft(async_client, headers, customer["id"])
    resp = await async_client.post(
        f"{API}/invoices/{draft['id']}/payments",
        headers=headers,
        json={"method": "cash", "amount_minor": 1, "paid_date": TODAY.isoformat()},
    )
    assert resp.status_code == 409


# --- List and receivables -----------------------------------------------------------


async def test_list_filters_and_receivables_ageing(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    customer = await _customer(async_client, headers, db_async, "Ageing Co")
    line = [
        {"description": "S", "quantity": 1, "unit_price_minor": 10_000, "tax_rate": 0}
    ]
    current = await _issued(async_client, headers, customer["id"], lines=line)
    # due = issue + 30, so these are 5, 40, 70 and 120 days overdue
    d5 = await _issued(
        async_client,
        headers,
        customer["id"],
        issue_date=TODAY - timedelta(days=35),
        lines=line,
    )
    d40 = await _issued(
        async_client,
        headers,
        customer["id"],
        issue_date=TODAY - timedelta(days=70),
        lines=line,
    )
    d70 = await _issued(
        async_client,
        headers,
        customer["id"],
        issue_date=TODAY - timedelta(days=100),
        lines=line,
    )
    d120 = await _issued(
        async_client,
        headers,
        customer["id"],
        issue_date=TODAY - timedelta(days=150),
        lines=line,
    )
    paid = await _issued(async_client, headers, customer["id"], lines=line)
    await async_client.post(
        f"{API}/invoices/{paid['id']}/payments",
        headers=headers,
        json={"method": "cash", "amount_minor": 10_000, "paid_date": TODAY.isoformat()},
    )
    await async_client.post(
        f"{API}/invoices/{d5['id']}/payments",
        headers=headers,
        json={"method": "cash", "amount_minor": 4_000, "paid_date": TODAY.isoformat()},
    )
    await _draft(async_client, headers, customer["id"])

    rec = (await async_client.get(f"{API}/receivables", headers=headers)).json()
    by_bucket = {b["bucket"]: b for b in rec["buckets"]}
    assert [b["bucket"] for b in rec["buckets"]] == [
        "current",
        "days_1_30",
        "days_31_60",
        "days_61_90",
        "over_90",
    ]
    assert by_bucket["current"] == {
        "bucket": "current",
        "invoice_count": 1,
        "outstanding_minor": 10_000,
    }
    assert by_bucket["days_1_30"]["outstanding_minor"] == 6_000  # partially paid d5
    assert by_bucket["days_31_60"]["invoice_count"] == 1
    assert by_bucket["days_61_90"]["invoice_count"] == 1
    assert by_bucket["over_90"]["invoice_count"] == 1
    assert rec["count"] == 5
    assert rec["total_outstanding_minor"] == 10_000 + 6_000 + 3 * 10_000
    ordered = [row["number"] for row in rec["data"]]
    assert ordered[0] == d120["number"] and ordered[-1] == current["number"]
    assert {row["bucket"] for row in rec["data"]} == set(by_bucket)
    rows = {row["invoice_id"]: row for row in rec["data"]}
    assert rows[d40["id"]]["days_overdue"] == 40
    assert rows[d40["id"]]["bucket"] == "days_31_60"
    assert rows[d70["id"]]["bucket"] == "days_61_90"
    assert rows[current["id"]]["days_overdue"] == 0

    overdue = (
        await async_client.get(f"{API}/invoices?overdue=true", headers=headers)
    ).json()
    assert overdue["count"] == 4
    by_status = (
        await async_client.get(f"{API}/invoices?status=draft", headers=headers)
    ).json()
    assert by_status["count"] == 1
    by_number = (
        await async_client.get(f"{API}/invoices?q={current['number']}", headers=headers)
    ).json()
    assert by_number["count"] == 1
    by_name = (
        await async_client.get(f"{API}/invoices?q=ageing", headers=headers)
    ).json()
    assert by_name["count"] == 7
    paid_list = (
        await async_client.get(f"{API}/invoices?status=paid", headers=headers)
    ).json()
    assert [r["id"] for r in paid_list["data"]] == [paid["id"]]


# --- Reminders ----------------------------------------------------------------------


async def test_reminders_are_idempotent_per_invoice_and_stage(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    customer = await _customer(async_client, headers, db_async, "Remind Co")
    issued = await _issued(
        async_client, headers, customer["id"], issue_date=date(2036, 5, 1)
    )
    due = date.fromisoformat(issued["due_date"])
    other = await _issued(
        async_client, headers, customer["id"], issue_date=date(2036, 5, 1)
    )
    await async_client.post(
        f"{API}/invoices/{other['id']}/payments",
        headers=headers,
        json={
            "method": "cash",
            "amount_minor": 115_000,
            "paid_date": TODAY.isoformat(),
        },
    )
    baseline = len((await db_async.scalars(select(OutboundEmail))).all())

    async def run(day: date) -> int:
        async with async_session_factory() as session:
            return await reminders.send_due_reminders(session, today=day)

    assert await run(due - timedelta(days=8)) == 0
    assert await run(due - timedelta(days=7)) == 1
    assert await run(due - timedelta(days=7)) == 0
    assert await run(due - timedelta(days=6)) == 0  # same stage, still inside grace
    assert await run(due) == 1
    assert await run(due) == 0
    assert await run(due + timedelta(days=7)) == 1
    assert await run(due + timedelta(days=7)) == 0

    stages = sorted((await db_async.scalars(select(InvoiceReminder.stage))).all())
    assert stages == ["before_due_7", "due_today", "overdue_7"]
    mails = (
        await db_async.scalars(select(OutboundEmail).order_by(OutboundEmail.created_at))
    ).all()
    reminder_mails = mails[baseline:]
    assert len(reminder_mails) == 3
    assert "due in 7 days" in reminder_mails[0].subject
    assert "due today" in reminder_mails[1].subject
    assert "7 days ago" in reminder_mails[2].subject


async def test_no_reminder_for_voided_or_paid_invoices(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    customer = await _customer(async_client, headers, db_async, "Quiet Co")
    issued = await _issued(
        async_client, headers, customer["id"], issue_date=date(2037, 5, 1)
    )
    await async_client.post(
        f"{API}/invoices/{issued['id']}/void",
        headers=headers,
        json={"reason": "Wrong client"},
    )
    async with async_session_factory() as session:
        sent = await reminders.send_due_reminders(
            session, today=date.fromisoformat(issued["due_date"])
        )
    assert sent == 0


# --- Access and audit ---------------------------------------------------------------


async def test_invoicing_endpoints_deny_ordinary_users_and_anonymous(
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    fake = "00000000-0000-0000-0000-000000000000"
    calls = [
        ("GET", f"{API}/customers", None),
        (
            "POST",
            f"{API}/customers",
            {"organisation_id": "x", "billing_email": "a@b.co"},
        ),
        ("GET", f"{API}/invoices", None),
        ("POST", f"{API}/invoices", {"customer_id": fake, "lines": []}),
        ("GET", f"{API}/invoices/{fake}", None),
        ("PUT", f"{API}/invoices/{fake}", {"customer_id": fake, "lines": []}),
        ("DELETE", f"{API}/invoices/{fake}", None),
        ("POST", f"{API}/invoices/{fake}/issue", None),
        ("POST", f"{API}/invoices/{fake}/void", {"reason": "nope"}),
        (
            "POST",
            f"{API}/invoices/{fake}/payments",
            {"method": "cash", "amount_minor": 1, "paid_date": "2026-01-01"},
        ),
        ("GET", f"{API}/invoices/{fake}/pdf", None),
        ("GET", f"{API}/receivables", None),
    ]
    for method, url, body in calls:
        denied = await async_client.request(
            method, url, headers=normal_user_token_headers_async, json=body
        )
        assert denied.status_code == 403, (method, url, denied.status_code)
        anonymous = await async_client.request(method, url, json=body)
        assert anonymous.status_code == 401, (method, url, anonymous.status_code)


async def test_billing_manage_permission_grants_access(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "billing.manage")
    await assign_role(db_async, user=user, role=role)
    headers = headers_for(user)
    assert (
        await async_client.get(f"{API}/invoices", headers=headers)
    ).status_code == 200
    customer = await _customer(async_client, headers, db_async, "Delegated Co")
    issued = await _issued(async_client, headers, customer["id"])
    assert issued["status"] == "issued"


async def test_customer_rules(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    customer = await _customer(async_client, headers, db_async, "Cust Co")
    again = await async_client.post(
        f"{API}/customers",
        headers=headers,
        json={
            "organisation_id": customer["organisation_id"],
            "billing_email": "x@example.com",
        },
    )
    assert again.status_code == 409
    missing = await async_client.post(
        f"{API}/customers",
        headers=headers,
        json={"organisation_id": "org_missing", "billing_email": "x@example.com"},
    )
    assert missing.status_code == 404
    patched = await async_client.patch(
        f"{API}/customers/{customer['id']}",
        headers=headers,
        json={"billing_email": "NEW@Example.com", "address": None},
    )
    assert patched.status_code == 200
    assert patched.json()["billing_email"] == "new@example.com"
    assert patched.json()["address"] is None
    listed = await async_client.get(f"{API}/customers?q=cust", headers=headers)
    assert listed.json()["count"] == 1


async def test_invoice_changes_are_audited(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    headers = superuser_token_headers_async
    customer = await _customer(async_client, headers, db_async, "Audit Co")
    issued = await _issued(async_client, headers, customer["id"])
    await async_client.post(
        f"{API}/invoices/{issued['id']}/payments",
        headers=headers,
        json={"method": "cash", "amount_minor": 500, "paid_date": TODAY.isoformat()},
    )
    entries = (
        await db_async.scalars(
            select(AuditEntry)
            .where(
                AuditEntry.entity_type == "billing_invoice",
                AuditEntry.entity_id == issued["id"],
            )
            .execution_options(populate_existing=True)
        )
    ).all()
    record_types = {entry.record_type for entry in entries}
    assert {
        "billing_invoice",
        "billing_invoice_line",
        "billing_payment",
    } <= record_types
    status_fields = [
        change["new"]
        for entry in entries
        if entry.record_type == "billing_invoice"
        for change in entry.changes
        if change["field"] == "status"
    ]
    assert "issued" in status_fields
    assert "partially_paid" in status_fields
    assert all(entry.actor_user_id is not None for entry in entries)

    history = await async_client.get(
        f"/api/v1/audit/billing_invoice/{issued['id']}", headers=headers
    )
    assert history.status_code == 200


def test_money_formatting_and_invoice_draft_defaults() -> None:
    assert calc.format_money(123456789) == "XCD 1,234,567.89"
    assert calc.format_money(5) == "XCD 0.05"
    assert calc.format_money(-250) == "XCD -2.50"
    draft = InvoiceDraftWrite(
        customer_id=uuid.UUID(int=0),
        lines=[InvoiceLineInput(description="x", quantity=1, unit_price_minor=1)],
    )
    assert draft.lines[0].tax_rate is None


@pytest.mark.parametrize("rate", [0.001, 100.5, -1])
def test_line_rate_validation(rate: float) -> None:
    with pytest.raises(ValueError, match="tax_rate|decimal|less|greater"):
        InvoiceLineInput(description="x", quantity=1, unit_price_minor=1, tax_rate=rate)


def test_clock_is_frozen_for_the_module() -> None:
    assert invoices.today_grenada() == TODAY
    assert reminders.today_grenada() == TODAY
