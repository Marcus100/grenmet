"""Invoicing routes: customers, invoices, payments, receivables.

Open to superusers and holders of ``billing.manage``. The router commits; the
service functions flush.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Query, Response, status

from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED, CONFLICT, NOT_FOUND
from src.pagination import PaginationDep

from . import customers, invoices
from .dependencies import BillingManager
from .models import InvoiceStatus
from .schemas import (
    CustomerCreate,
    CustomerListPublic,
    CustomerPublic,
    CustomerUpdate,
    InvoiceDetailPublic,
    InvoiceDraftWrite,
    InvoiceIssue,
    InvoiceListPublic,
    InvoiceVoid,
    PaymentCreate,
    ReceivablesPublic,
)

router = APIRouter(prefix="/billing", tags=["billing"])

WRITE_ERRORS = {**AUTHENTICATED, **NOT_FOUND, **CONFLICT}


@router.get(
    "/customers",
    response_model=CustomerListPublic,
    summary="List billing customers",
    description="Billing customers (platform organisations Barrels invoices), paginated.",
    responses={**AUTHENTICATED},
)
async def list_customers(
    *,
    session: SessionDep,
    _manager: BillingManager,
    pagination: PaginationDep,
    q: str | None = Query(default=None, max_length=100),
) -> Any:
    rows, total = await customers.list_customers(
        session, skip=pagination.skip, limit=pagination.limit, query=q
    )
    return CustomerListPublic(
        data=rows, count=total, page=pagination.page, size=pagination.size
    )


@router.post(
    "/customers",
    response_model=CustomerPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a billing customer",
    description="Make a platform organisation billable. One customer per organisation.",
    responses={**WRITE_ERRORS},
)
async def create_customer(
    *, session: SessionDep, manager: BillingManager, payload: CustomerCreate
) -> Any:
    result = await customers.create(session, manager, payload)
    await session.commit()
    return result


@router.get(
    "/customers/{customer_id}",
    response_model=CustomerPublic,
    summary="Read a billing customer",
    description="One billing customer with its organisation name.",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def get_customer(
    *, session: SessionDep, _manager: BillingManager, customer_id: uuid.UUID
) -> Any:
    return await customers.get(session, customer_id)


@router.patch(
    "/customers/{customer_id}",
    response_model=CustomerPublic,
    summary="Update a billing customer",
    description="Change the billing email or address. Issued invoices keep their number and amounts.",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def update_customer(
    *,
    session: SessionDep,
    manager: BillingManager,
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
) -> Any:
    result = await customers.update(session, manager, customer_id, payload)
    await session.commit()
    return result


@router.get(
    "/invoices",
    response_model=InvoiceListPublic,
    summary="List invoices",
    description=(
        "Invoices newest first, filterable by status, customer, number or "
        "customer name, and overdue-only."
    ),
    responses={**AUTHENTICATED},
)
async def list_invoices(
    *,
    session: SessionDep,
    _manager: BillingManager,
    pagination: PaginationDep,
    status_filter: InvoiceStatus | None = Query(default=None, alias="status"),
    customer_id: uuid.UUID | None = None,
    q: str | None = Query(default=None, max_length=100),
    overdue: bool = False,
) -> Any:
    rows, total = await invoices.list_invoices(
        session,
        skip=pagination.skip,
        limit=pagination.limit,
        status=status_filter,
        customer_id=customer_id,
        query=q,
        overdue=overdue,
    )
    return InvoiceListPublic(
        data=rows, count=total, page=pagination.page, size=pagination.size
    )


@router.post(
    "/invoices",
    response_model=InvoiceDetailPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a draft invoice",
    description=(
        "Create a draft with its lines. Totals are computed on the server in "
        "minor units, rounding half-up per line; omitted tax rates use the "
        "configured default."
    ),
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def create_invoice(
    *, session: SessionDep, manager: BillingManager, payload: InvoiceDraftWrite
) -> Any:
    result = await invoices.create_draft(session, manager, payload)
    await session.commit()
    return result


@router.get(
    "/invoices/{invoice_id}",
    response_model=InvoiceDetailPublic,
    summary="Read an invoice",
    description="One invoice with its lines and payments.",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def get_invoice(
    *, session: SessionDep, _manager: BillingManager, invoice_id: uuid.UUID
) -> Any:
    return await invoices.get_detail(session, invoice_id)


@router.put(
    "/invoices/{invoice_id}",
    response_model=InvoiceDetailPublic,
    summary="Replace a draft invoice",
    description="Replace the customer, notes and lines of a draft. Issued invoices are immutable (409).",
    responses={**WRITE_ERRORS},
)
async def update_invoice(
    *,
    session: SessionDep,
    manager: BillingManager,
    invoice_id: uuid.UUID,
    payload: InvoiceDraftWrite,
) -> Any:
    result = await invoices.update_draft(session, manager, invoice_id, payload)
    await session.commit()
    return result


@router.delete(
    "/invoices/{invoice_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a draft invoice",
    description="Delete a draft that was never issued. Issued invoices are voided instead (409).",
    responses={**WRITE_ERRORS},
)
async def delete_invoice(
    *, session: SessionDep, manager: BillingManager, invoice_id: uuid.UUID
) -> Response:
    await invoices.delete_draft(session, manager, invoice_id)
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/invoices/{invoice_id}/issue",
    response_model=InvoiceDetailPublic,
    summary="Issue an invoice",
    description=(
        "Assign the next gapless number, set the issue and due dates (net 30 by "
        "default), render and store the PDF, and email the customer through the "
        "outbox."
    ),
    responses={**WRITE_ERRORS},
)
async def issue_invoice(
    *,
    session: SessionDep,
    manager: BillingManager,
    invoice_id: uuid.UUID,
    payload: InvoiceIssue | None = None,
) -> Any:
    result = await invoices.issue(
        session,
        manager,
        invoice_id,
        issue_date=payload.issue_date if payload else None,
    )
    await session.commit()
    return result


@router.post(
    "/invoices/{invoice_id}/void",
    response_model=InvoiceDetailPublic,
    summary="Void an issued invoice",
    description="Void an issued invoice with no payments. The reason is required and audited; the number is never reused.",
    responses={**WRITE_ERRORS},
)
async def void_invoice(
    *,
    session: SessionDep,
    manager: BillingManager,
    invoice_id: uuid.UUID,
    payload: InvoiceVoid,
) -> Any:
    result = await invoices.void(session, manager, invoice_id, reason=payload.reason)
    await session.commit()
    return result


@router.post(
    "/invoices/{invoice_id}/payments",
    response_model=InvoiceDetailPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Record a manual payment",
    description=(
        "Record a bank transfer, cash or cheque payment. Partial payments move "
        "the invoice to partially paid; paying the balance marks it paid. A "
        "payment above the outstanding balance is rejected (422)."
    ),
    responses={**WRITE_ERRORS},
)
async def record_payment(
    *,
    session: SessionDep,
    manager: BillingManager,
    invoice_id: uuid.UUID,
    payload: PaymentCreate,
) -> Any:
    result = await invoices.record_payment(session, manager, invoice_id, payload)
    await session.commit()
    return result


@router.get(
    "/invoices/{invoice_id}/pdf",
    response_class=Response,
    summary="Download the invoice PDF",
    description="Render the invoice as a PDF on demand (drafts are watermarked).",
    responses={
        **AUTHENTICATED,
        **NOT_FOUND,
        status.HTTP_200_OK: {
            "description": "The invoice PDF",
            "content": {"application/pdf": {}},
        },
    },
)
async def download_invoice_pdf(
    *, session: SessionDep, _manager: BillingManager, invoice_id: uuid.UUID
) -> Response:
    filename, data = await invoices.render_pdf(session, invoice_id)
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get(
    "/receivables",
    response_model=ReceivablesPublic,
    summary="Receivables and ageing",
    description=(
        "Open invoices with the outstanding balance, ageing buckets (current, "
        "1-30, 31-60, 61-90, over 90 days past due) and a paginated list."
    ),
    responses={**AUTHENTICATED},
)
async def get_receivables(
    *, session: SessionDep, _manager: BillingManager, pagination: PaginationDep
) -> Any:
    return await invoices.receivables(
        session, skip=pagination.skip, limit=pagination.limit
    )
