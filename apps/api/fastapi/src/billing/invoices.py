"""Invoice service: drafts, issue, void, manual payments, list and receivables.

Functions ``flush`` and never ``commit``; the router owns the transaction. Issue
holds the year's counter row lock until the caller commits, so numbers are
gapless and unique even when several invoices are issued at once.
"""

import logging
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

import sqlalchemy as sa
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.audit import service as audit_service
from src.auth.models import User
from src.exceptions import AppValidationError
from src.organisations.models import PlatformOrganisation
from src.storage.config import storage_settings
from src.storage.service import storage_service
from src.utils.datetime import utc_now

from . import calc, emails, pdf
from .config import billing_settings
from .exceptions import (
    CustomerNotFoundError,
    InvoiceNotFoundError,
    InvoiceStateError,
    PaymentExceedsBalanceError,
)
from .models import (
    Customer,
    Invoice,
    InvoiceCounter,
    InvoiceLine,
    InvoiceStatus,
    Payment,
    PaymentMethod,
)
from .schemas import (
    AgeingBucket,
    AgeingBucketPublic,
    InvoiceDetailPublic,
    InvoiceDraftWrite,
    InvoiceLinePublic,
    InvoiceSummaryPublic,
    PaymentCreate,
    PaymentPublic,
    ReceivableRowPublic,
    ReceivablesPublic,
)

logger = logging.getLogger(__name__)

GRENADA = ZoneInfo("America/Grenada")
OPEN_STATUSES = (InvoiceStatus.ISSUED.value, InvoiceStatus.PARTIALLY_PAID.value)
PDF_LINK_SECONDS = 7 * 24 * 3600
ENTITY = "billing_invoice"


def today_grenada() -> date:
    return datetime.now(GRENADA).date()


def bucket_for(days_overdue: int) -> AgeingBucket:
    if days_overdue <= 0:
        return AgeingBucket.CURRENT
    if days_overdue <= 30:
        return AgeingBucket.DAYS_1_30
    if days_overdue <= 60:
        return AgeingBucket.DAYS_31_60
    if days_overdue <= 90:
        return AgeingBucket.DAYS_61_90
    return AgeingBucket.OVER_90


# --- Loading and views -------------------------------------------------------------


async def _load(
    session: AsyncSession, invoice_id: uuid.UUID, *, lock: bool = False
) -> Invoice:
    stmt = (
        select(Invoice)
        .where(Invoice.id == invoice_id)
        .options(
            selectinload(Invoice.lines),
            selectinload(Invoice.payments),
            selectinload(Invoice.customer),
        )
    )
    if lock:
        stmt = stmt.with_for_update(of=Invoice).execution_options(
            populate_existing=True
        )
    invoice = (await session.execute(stmt)).scalar_one_or_none()
    if invoice is None:
        raise InvoiceNotFoundError
    return invoice


def _summary_fields(
    invoice: Invoice, organisation_id: str, name: str
) -> dict[str, Any]:
    return {
        "id": invoice.id,
        "number": invoice.number,
        "status": InvoiceStatus(invoice.status),
        "customer_id": invoice.customer_id,
        "organisation_id": organisation_id,
        "customer_name": name,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "currency": invoice.currency,
        "total_minor": invoice.total_minor,
        "paid_minor": invoice.paid_minor,
        "outstanding_minor": invoice.total_minor - invoice.paid_minor
        if invoice.status != InvoiceStatus.VOID.value
        else 0,
        "created_at": invoice.created_at,
    }


async def detail_view(session: AsyncSession, invoice: Invoice) -> InvoiceDetailPublic:
    customer = invoice.customer
    organisation = await session.get(PlatformOrganisation, customer.organisation_id)
    name = organisation.name if organisation else customer.organisation_id
    return InvoiceDetailPublic(
        **_summary_fields(invoice, customer.organisation_id, name),
        billing_email=customer.billing_email,
        address=customer.address,
        legal_entity_name=invoice.legal_entity_name,
        subtotal_minor=invoice.subtotal_minor,
        tax_minor=invoice.tax_minor,
        notes=invoice.notes,
        void_reason=invoice.void_reason,
        voided_at=invoice.voided_at,
        issued_at=invoice.issued_at,
        pdf_stored=invoice.pdf_key is not None,
        lines=[
            InvoiceLinePublic(
                id=line.id,
                position=line.position,
                description=line.description,
                quantity=float(line.quantity),
                unit_price_minor=line.unit_price_minor,
                tax_rate=float(line.tax_rate),
                subtotal_minor=line.subtotal_minor,
                tax_minor=line.tax_minor,
            )
            for line in invoice.lines
        ],
        payments=[
            PaymentPublic(
                id=payment.id,
                method=PaymentMethod(payment.method),
                reference=payment.reference,
                amount_minor=payment.amount_minor,
                paid_date=payment.paid_date,
                created_at=payment.created_at,
            )
            for payment in invoice.payments
        ],
    )


async def get_detail(
    session: AsyncSession, invoice_id: uuid.UUID
) -> InvoiceDetailPublic:
    return await detail_view(session, await _load(session, invoice_id))


async def list_invoices(
    session: AsyncSession,
    *,
    skip: int,
    limit: int,
    status: InvoiceStatus | None = None,
    customer_id: uuid.UUID | None = None,
    query: str | None = None,
    overdue: bool = False,
) -> tuple[list[InvoiceSummaryPublic], int]:
    base = (
        select(Invoice, Customer.organisation_id, PlatformOrganisation.name)
        .join(Customer, Customer.id == Invoice.customer_id)
        .join(PlatformOrganisation, PlatformOrganisation.id == Customer.organisation_id)
    )
    if status is not None:
        base = base.where(Invoice.status == status.value)
    if customer_id is not None:
        base = base.where(Invoice.customer_id == customer_id)
    if overdue:
        base = base.where(
            Invoice.status.in_(OPEN_STATUSES), Invoice.due_date < today_grenada()
        )
    if query and query.strip():
        like = f"%{query.strip()}%"
        base = base.where(
            Invoice.number.ilike(like) | PlatformOrganisation.name.ilike(like)
        )
    total = await session.scalar(select(func.count()).select_from(base.subquery()))
    rows = (
        await session.execute(
            base.order_by(Invoice.created_at.desc(), Invoice.id)
            .offset(skip)
            .limit(limit)
        )
    ).all()
    return (
        [
            InvoiceSummaryPublic(**_summary_fields(invoice, org_id, name))
            for invoice, org_id, name in rows
        ],
        total or 0,
    )


# --- Drafts ------------------------------------------------------------------------


def _apply_lines(invoice: Invoice, payload: InvoiceDraftWrite) -> None:
    default_rate = billing_settings.INVOICE_DEFAULT_TAX_RATE
    lines: list[InvoiceLine] = []
    subtotal = tax = 0
    for position, item in enumerate(payload.lines, start=1):
        quantity = Decimal(str(item.quantity))
        rate = default_rate if item.tax_rate is None else Decimal(str(item.tax_rate))
        totals = calc.line_totals(quantity, item.unit_price_minor, rate)
        subtotal += totals.subtotal_minor
        tax += totals.tax_minor
        lines.append(
            InvoiceLine(
                position=position,
                description=item.description.strip(),
                quantity=quantity,
                unit_price_minor=item.unit_price_minor,
                tax_rate=rate,
                subtotal_minor=totals.subtotal_minor,
                tax_minor=totals.tax_minor,
            )
        )
    invoice.lines = lines
    invoice.subtotal_minor = subtotal
    invoice.tax_minor = tax
    invoice.total_minor = subtotal + tax


async def _require_customer(session: AsyncSession, customer_id: uuid.UUID) -> None:
    if await session.get(Customer, customer_id) is None:
        raise CustomerNotFoundError


async def create_draft(
    session: AsyncSession, actor: User, payload: InvoiceDraftWrite
) -> InvoiceDetailPublic:
    await _require_customer(session, payload.customer_id)
    audit_service.set_actor(session, actor.id)
    invoice = Invoice(
        customer_id=payload.customer_id,
        notes=payload.notes,
        currency=billing_settings.INVOICE_CURRENCY,
        created_by_user_id=actor.id,
    )
    _apply_lines(invoice, payload)
    session.add(invoice)
    await session.flush()
    return await get_detail(session, invoice.id)


async def update_draft(
    session: AsyncSession,
    actor: User,
    invoice_id: uuid.UUID,
    payload: InvoiceDraftWrite,
) -> InvoiceDetailPublic:
    invoice = await _load(session, invoice_id, lock=True)
    if invoice.status != InvoiceStatus.DRAFT.value:
        raise InvoiceStateError("Only a draft invoice can be edited")
    await _require_customer(session, payload.customer_id)
    audit_service.set_actor(session, actor.id)
    invoice.customer_id = payload.customer_id
    invoice.notes = payload.notes
    _apply_lines(invoice, payload)
    await session.flush()
    session.expire(invoice, ["customer"])
    return await get_detail(session, invoice_id)


async def delete_draft(
    session: AsyncSession, actor: User, invoice_id: uuid.UUID
) -> None:
    invoice = await _load(session, invoice_id, lock=True)
    if invoice.status != InvoiceStatus.DRAFT.value:
        raise InvoiceStateError("Only a draft invoice can be deleted; void it instead")
    audit_service.set_actor(session, actor.id)
    await session.delete(invoice)
    await session.flush()


# --- Issue -------------------------------------------------------------------------


async def _next_number(session: AsyncSession, year: int) -> str:
    """Gapless per year: the counter row is locked until the issuing transaction ends."""
    await session.execute(
        pg_insert(InvoiceCounter)
        .values(year=year, last_number=0)
        .on_conflict_do_nothing(index_elements=["year"])
    )
    counter = (
        await session.execute(
            select(InvoiceCounter)
            .where(InvoiceCounter.year == year)
            .with_for_update()
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    counter.last_number += 1
    await session.flush()
    padding = billing_settings.INVOICE_NUMBER_PADDING
    return f"{billing_settings.INVOICE_NUMBER_PREFIX}-{year}-{counter.last_number:0{padding}d}"


def document_for(invoice: Invoice, customer_name: str) -> pdf.InvoiceDocument:
    return pdf.InvoiceDocument(
        number=invoice.number,
        status=invoice.status,
        legal_entity_name=invoice.legal_entity_name
        or billing_settings.INVOICE_LEGAL_ENTITY_NAME,
        customer_name=customer_name,
        billing_email=invoice.customer.billing_email,
        address=invoice.customer.address,
        issue_date=invoice.issue_date,
        due_date=invoice.due_date,
        currency=invoice.currency,
        subtotal_minor=invoice.subtotal_minor,
        tax_minor=invoice.tax_minor,
        total_minor=invoice.total_minor,
        paid_minor=invoice.paid_minor,
        notes=invoice.notes,
        lines=[
            pdf.PdfLine(
                description=line.description,
                quantity=line.quantity,
                unit_price_minor=line.unit_price_minor,
                tax_rate=line.tax_rate,
                subtotal_minor=line.subtotal_minor,
            )
            for line in invoice.lines
        ],
    )


async def render_pdf(session: AsyncSession, invoice_id: uuid.UUID) -> tuple[str, bytes]:
    """Render any invoice on demand; returns (filename, PDF bytes)."""
    invoice = await _load(session, invoice_id)
    organisation = await session.get(
        PlatformOrganisation, invoice.customer.organisation_id
    )
    name = organisation.name if organisation else invoice.customer.organisation_id
    data = await run_in_threadpool(pdf.render_invoice_pdf, document_for(invoice, name))
    stem = invoice.number or f"draft-{invoice.id}"
    return f"{stem}.pdf", data


def download_url(invoice: Invoice) -> str | None:
    """A time-limited link to the stored PDF, or None when nothing is stored."""
    if invoice.pdf_key is None or not storage_settings.enabled:
        return None
    return storage_service.presigned_download_url(
        invoice.pdf_key, expires_in=PDF_LINK_SECONDS
    )


async def issue(
    session: AsyncSession,
    actor: User,
    invoice_id: uuid.UUID,
    *,
    issue_date: date | None = None,
) -> InvoiceDetailPublic:
    invoice = await _load(session, invoice_id, lock=True)
    if invoice.status != InvoiceStatus.DRAFT.value:
        raise InvoiceStateError("Only a draft invoice can be issued")
    if not invoice.lines:
        raise AppValidationError("Add at least one line before issuing")
    if invoice.total_minor <= 0:
        raise AppValidationError("An invoice must have a total above zero")
    audit_service.set_actor(session, actor.id)
    issued_on = issue_date or today_grenada()
    invoice.number = await _next_number(session, issued_on.year)
    invoice.issue_date = issued_on
    invoice.due_date = issued_on + timedelta(
        days=billing_settings.INVOICE_PAYMENT_TERMS_DAYS
    )
    invoice.legal_entity_name = billing_settings.INVOICE_LEGAL_ENTITY_NAME
    invoice.status = InvoiceStatus.ISSUED.value
    invoice.issued_at = utc_now()
    await session.flush()

    organisation = await session.get(
        PlatformOrganisation, invoice.customer.organisation_id
    )
    name = organisation.name if organisation else invoice.customer.organisation_id
    data = await run_in_threadpool(pdf.render_invoice_pdf, document_for(invoice, name))
    if storage_settings.enabled:
        key = f"billing/invoices/{invoice.id}.pdf"
        await run_in_threadpool(
            storage_service.put_object, key, data, content_type="application/pdf"
        )
        invoice.pdf_key = key
    emails.queue_invoice_email(
        session,
        invoice=invoice,
        to_email=invoice.customer.billing_email,
        pdf_url=download_url(invoice),
    )
    await session.flush()
    logger.info(
        "Invoice issued",
        extra={"invoice_id": str(invoice.id), "number": invoice.number},
    )
    return await detail_view(session, invoice)


# --- Void and payments -------------------------------------------------------------


async def void(
    session: AsyncSession, actor: User, invoice_id: uuid.UUID, *, reason: str
) -> InvoiceDetailPublic:
    invoice = await _load(session, invoice_id, lock=True)
    if invoice.status != InvoiceStatus.ISSUED.value:
        raise InvoiceStateError(
            "Only an issued invoice with no payments can be voided"
            if invoice.status != InvoiceStatus.DRAFT.value
            else "A draft is deleted, not voided"
        )
    audit_service.set_actor(session, actor.id)
    clean = reason.strip()
    invoice.status = InvoiceStatus.VOID.value
    invoice.void_reason = clean
    invoice.voided_at = utc_now()
    await audit_service.record_change(
        session,
        entity_type=ENTITY,
        entity_id=str(invoice.id),
        record_type=ENTITY,
        record_id=str(invoice.id),
        action="void",
        changes={"reason": (None, clean)},
    )
    await session.flush()
    return await detail_view(session, invoice)


async def record_payment(
    session: AsyncSession,
    actor: User,
    invoice_id: uuid.UUID,
    payload: PaymentCreate,
) -> InvoiceDetailPublic:
    invoice = await _load(session, invoice_id, lock=True)
    if invoice.status not in OPEN_STATUSES:
        raise InvoiceStateError("Payments can only be recorded on an open invoice")
    if payload.paid_date > today_grenada():
        raise AppValidationError("The payment date cannot be in the future")
    outstanding = invoice.total_minor - invoice.paid_minor
    if payload.amount_minor > outstanding:
        raise PaymentExceedsBalanceError(outstanding)
    audit_service.set_actor(session, actor.id)
    session.add(
        Payment(
            invoice_id=invoice.id,
            method=payload.method.value,
            reference=payload.reference,
            amount_minor=payload.amount_minor,
            paid_date=payload.paid_date,
            recorded_by_user_id=actor.id,
        )
    )
    invoice.paid_minor += payload.amount_minor
    invoice.status = (
        InvoiceStatus.PAID.value
        if invoice.paid_minor == invoice.total_minor
        else InvoiceStatus.PARTIALLY_PAID.value
    )
    await session.flush()
    session.expire(invoice, ["payments"])
    return await get_detail(session, invoice_id)


# --- Receivables -------------------------------------------------------------------


async def receivables(
    session: AsyncSession, *, skip: int, limit: int, as_of: date | None = None
) -> ReceivablesPublic:
    today = as_of or today_grenada()
    outstanding = Invoice.total_minor - Invoice.paid_minor
    due = Invoice.due_date
    bucket = sa.case(
        (due >= today, AgeingBucket.CURRENT.value),
        (due >= today - timedelta(days=30), AgeingBucket.DAYS_1_30.value),
        (due >= today - timedelta(days=60), AgeingBucket.DAYS_31_60.value),
        (due >= today - timedelta(days=90), AgeingBucket.DAYS_61_90.value),
        else_=AgeingBucket.OVER_90.value,
    )
    open_filter = (Invoice.status.in_(OPEN_STATUSES), Invoice.due_date.is_not(None))
    sums = {
        row.bucket: (row.invoices, row.amount)
        for row in (
            await session.execute(
                select(
                    bucket.label("bucket"),
                    func.count().label("invoices"),
                    func.coalesce(func.sum(outstanding), 0).label("amount"),
                )
                .where(*open_filter)
                .group_by(bucket)
            )
        ).all()
    }
    buckets = [
        AgeingBucketPublic(
            bucket=name,
            invoice_count=sums.get(name.value, (0, 0))[0],
            outstanding_minor=int(sums.get(name.value, (0, 0))[1]),
        )
        for name in AgeingBucket
    ]
    count = sum(item.invoice_count for item in buckets)
    rows = (
        await session.execute(
            select(Invoice, PlatformOrganisation.name)
            .join(Customer, Customer.id == Invoice.customer_id)
            .join(
                PlatformOrganisation,
                PlatformOrganisation.id == Customer.organisation_id,
            )
            .where(*open_filter)
            .order_by(Invoice.due_date, Invoice.number)
            .offset(skip)
            .limit(limit)
        )
    ).all()
    data = []
    for invoice, name in rows:
        assert invoice.due_date is not None and invoice.number is not None
        days = (today - invoice.due_date).days
        data.append(
            ReceivableRowPublic(
                invoice_id=invoice.id,
                number=invoice.number,
                customer_name=name,
                due_date=invoice.due_date,
                days_overdue=max(days, 0),
                bucket=bucket_for(days),
                total_minor=invoice.total_minor,
                outstanding_minor=invoice.total_minor - invoice.paid_minor,
            )
        )
    return ReceivablesPublic(
        as_of=today,
        currency=billing_settings.INVOICE_CURRENCY,
        total_outstanding_minor=sum(item.outstanding_minor for item in buckets),
        buckets=buckets,
        data=data,
        count=count,
        page=skip // limit + 1 if limit else 1,
        size=limit,
    )
