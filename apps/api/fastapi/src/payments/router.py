"""Payments routes (ADR-0027, ADR-0025 zones).

- ``org``: organisation admins with the ``payments`` entitlement create intents,
  record manual payments and refund. Other organisations' payments answer 404.
- ``public``: provider callbacks, authenticated by signature, never by session.
- ``admin``: superusers reconcile, pay out and see everything.

Routers commit; service functions flush.
"""

import uuid
from datetime import date
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request, Response, status

from src.dependencies import AdminUser, SessionDep
from src.openapi_responses import (
    AUTHENTICATED,
    BAD_REQUEST,
    CONFLICT,
    NOT_FOUND,
    ResponseMap,
)
from src.organisations.dependencies import OrgContext, require_org_app
from src.organisations.models import MembershipRole
from src.pagination import PaginationDep

from . import schemas, service
from .models import IntentStatus, LedgerKind

router = APIRouter(prefix="/payments", tags=["payments"])

# Organisation routes require the "payments" entitlement (org.organisation_app).
PaymentsOrgAdmin = Annotated[
    OrgContext, Depends(require_org_app("payments", MembershipRole.ADMIN))
]

WRITE_ERRORS: ResponseMap = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}
_UNAVAILABLE: ResponseMap = {
    503: {"description": "The payment provider is not available"}
}
_BAD_GATEWAY: ResponseMap = {
    502: {"description": "The payment provider failed the request"}
}


# --- organisation ---------------------------------------------------------------------


@router.post(
    "/org/intents",
    response_model=schemas.PaymentCheckoutPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create a payment",
    description=(
        "Ask to collect money for something the organisation sells. Idempotent per "
        "`idempotency_key`. Online rails return a hosted checkout URL; the manual "
        "rail is completed by staff recording the payment. `source_type` values owned "
        "by another domain (`bookings.deposit`, `events.order`) are refused with 422."
    ),
    operation_id="paymentsCreateIntent",
    responses={**WRITE_ERRORS, **_UNAVAILABLE, **_BAD_GATEWAY},
)
async def create_intent(
    *, session: SessionDep, org: PaymentsOrgAdmin, payload: schemas.PaymentIntentCreate
) -> Any:
    service.reject_reserved_source(payload.source_type)
    result = await service.create_intent(
        session, organisation_id=org.organisation_id, actor=org.user, payload=payload
    )
    await session.commit()
    return result


@router.get(
    "/org/intents",
    response_model=schemas.PaymentIntentListPublic,
    summary="List the organisation's payments",
    description="Newest first, with optional status and source filters.",
    operation_id="paymentsListIntents",
    responses={**AUTHENTICATED},
)
async def list_intents(
    *,
    session: SessionDep,
    org: PaymentsOrgAdmin,
    pagination: PaginationDep,
    status_filter: Annotated[IntentStatus | None, Query(alias="status")] = None,
    source_type: Annotated[str | None, Query(max_length=60)] = None,
    source_id: Annotated[str | None, Query(max_length=120)] = None,
) -> Any:
    rows, total = await service.list_intents(
        session,
        organisation_id=org.organisation_id,
        status=status_filter,
        source_type=source_type,
        source_id=source_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return schemas.PaymentIntentListPublic(
        data=rows, count=total, page=pagination.page, size=pagination.size
    )


@router.get(
    "/org/balance",
    response_model=schemas.PaymentBalanceListPublic,
    summary="What Barrels holds for the organisation",
    description="The ledger balance per currency: charges less refunds, fees and payouts.",
    operation_id="paymentsGetBalance",
    responses={**AUTHENTICATED},
)
async def get_balance(*, session: SessionDep, org: PaymentsOrgAdmin) -> Any:
    return schemas.PaymentBalanceListPublic(
        data=await service.balances(session, org.organisation_id)
    )


@router.get(
    "/org/intents/{intent_id}",
    response_model=schemas.PaymentIntentDetailPublic,
    summary="Get a payment",
    description="One payment with its attempts and refunds.",
    operation_id="paymentsGetIntent",
    responses={**AUTHENTICATED, **NOT_FOUND},
)
async def get_intent(
    *, session: SessionDep, org: PaymentsOrgAdmin, intent_id: uuid.UUID
) -> Any:
    return await service.get_intent_detail(session, org.organisation_id, intent_id)


@router.post(
    "/org/intents/{intent_id}/manual-payments",
    response_model=schemas.PaymentIntentPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Record a cash, bank or cheque payment",
    description="Staff confirm money received outside the card rail; the payment succeeds now.",
    operation_id="paymentsRecordManualPayment",
    responses={**WRITE_ERRORS},
)
async def record_manual_payment(
    *,
    session: SessionDep,
    org: PaymentsOrgAdmin,
    intent_id: uuid.UUID,
    payload: schemas.ManualPaymentCreate,
) -> Any:
    result = await service.record_manual_payment(
        session,
        organisation_id=org.organisation_id,
        intent_id=intent_id,
        actor=org.user,
        payload=payload,
    )
    await session.commit()
    return result


@router.post(
    "/org/intents/{intent_id}/refunds",
    response_model=schemas.PaymentRefundPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Refund a payment",
    description=(
        "Hand money back. The total refunded cannot exceed what was collected "
        "(422 when it would)."
    ),
    operation_id="paymentsCreateRefund",
    responses={**WRITE_ERRORS, **_UNAVAILABLE, **_BAD_GATEWAY},
)
async def create_refund(
    *,
    session: SessionDep,
    org: PaymentsOrgAdmin,
    intent_id: uuid.UUID,
    payload: schemas.PaymentRefundCreate,
) -> Any:
    result = await service.refund_intent(
        session,
        organisation_id=org.organisation_id,
        intent_id=intent_id,
        actor=org.user,
        payload=payload,
    )
    await session.commit()
    return result


# --- provider callbacks ---------------------------------------------------------------


@router.post(
    "/public/webhooks/{provider}",
    response_model=schemas.PaymentCallbackAck,
    status_code=status.HTTP_200_OK,
    summary="Receive a payment provider callback",
    description=(
        "Verified by the provider's signature. Idempotent: a replayed event "
        "changes nothing and still answers 200."
    ),
    operation_id="paymentsReceiveWebhook",
    responses={
        400: {"description": "Invalid or stale signature"},
        404: {"description": "Unknown provider"},
        503: {"description": "The provider is not configured or is unsafe"},
    },
    include_in_schema=False,
)
async def receive_webhook(
    *, session: SessionDep, request: Request, provider: str
) -> Any:
    body = await request.body()
    await service.process_callback(
        session, provider_key=provider, headers=request.headers, body=body
    )
    await session.commit()
    return schemas.PaymentCallbackAck()


# --- administration -------------------------------------------------------------------


@router.get(
    "/admin/intents",
    response_model=schemas.PaymentIntentListPublic,
    summary="List every payment",
    description="Superusers see all organisations' payments, optionally for one.",
    operation_id="paymentsAdminListIntents",
    responses={**AUTHENTICATED},
)
async def admin_list_intents(
    *,
    session: SessionDep,
    _admin: AdminUser,
    pagination: PaginationDep,
    organisation_id: Annotated[str | None, Query(max_length=100)] = None,
    status_filter: Annotated[IntentStatus | None, Query(alias="status")] = None,
) -> Any:
    rows, total = await service.list_intents(
        session,
        organisation_id=organisation_id,
        status=status_filter,
        source_type=None,
        source_id=None,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return schemas.PaymentIntentListPublic(
        data=rows, count=total, page=pagination.page, size=pagination.size
    )


@router.get(
    "/admin/ledger",
    response_model=schemas.PaymentLedgerListPublic,
    summary="List ledger entries",
    description="The append-only ledger, newest first.",
    operation_id="paymentsAdminListLedger",
    responses={**AUTHENTICATED},
)
async def admin_list_ledger(
    *,
    session: SessionDep,
    _admin: AdminUser,
    pagination: PaginationDep,
    organisation_id: Annotated[str | None, Query(max_length=100)] = None,
    kind: LedgerKind | None = None,
) -> Any:
    rows, total = await service.list_ledger(
        session,
        organisation_id=organisation_id,
        kind=kind,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return schemas.PaymentLedgerListPublic(
        data=rows, count=total, page=pagination.page, size=pagination.size
    )


@router.get(
    "/admin/balances",
    response_model=schemas.PaymentBalanceListPublic,
    summary="What Barrels holds for each organisation",
    description="Ledger balances per organisation and currency.",
    operation_id="paymentsAdminListBalances",
    responses={**AUTHENTICATED},
)
async def admin_list_balances(*, session: SessionDep, _admin: AdminUser) -> Any:
    return schemas.PaymentBalanceListPublic(data=await service.balances(session, None))


@router.post(
    "/admin/payouts",
    response_model=schemas.PaymentLedgerEntryPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Record a payout to an organisation",
    description=(
        "Appends a payout entry after Barrels has paid the organisation. It "
        "cannot exceed what the organisation is owed."
    ),
    operation_id="paymentsAdminCreatePayout",
    responses={**WRITE_ERRORS},
)
async def admin_create_payout(
    *, session: SessionDep, admin: AdminUser, payload: schemas.PaymentPayoutCreate
) -> Any:
    result = await service.create_payout(session, actor=admin, payload=payload)
    await session.commit()
    return result


@router.get(
    "/admin/reconciliation",
    response_model=schemas.PaymentReconciliationPublic,
    summary="Reconcile the ledger for a period",
    description=(
        "Per organisation and currency: opening balance, charges, refunds, fees, "
        "adjustments, payouts and closing balance for Grenada days start to end "
        "inclusive."
    ),
    operation_id="paymentsAdminGetReconciliation",
    responses={**AUTHENTICATED, **BAD_REQUEST},
)
async def admin_get_reconciliation(
    *,
    session: SessionDep,
    _admin: AdminUser,
    start_date: date,
    end_date: date,
    organisation_id: Annotated[str | None, Query(max_length=100)] = None,
) -> Any:
    return await service.reconciliation(
        session,
        start_date=start_date,
        end_date=end_date,
        organisation_id=organisation_id,
    )


@router.get(
    "/admin/reconciliation.csv",
    response_class=Response,
    status_code=status.HTTP_200_OK,
    summary="Export the reconciliation as CSV",
    description="The reconciliation report as a spreadsheet-ready CSV download.",
    operation_id="paymentsAdminGetReconciliationCsv",
    responses={
        **AUTHENTICATED,
        200: {"content": {"text/csv": {"schema": {"type": "string"}}}},
    },
)
async def admin_get_reconciliation_csv(
    *,
    session: SessionDep,
    _admin: AdminUser,
    start_date: date,
    end_date: date,
    organisation_id: Annotated[str | None, Query(max_length=100)] = None,
) -> Response:
    report = await service.reconciliation(
        session,
        start_date=start_date,
        end_date=end_date,
        organisation_id=organisation_id,
    )
    return Response(
        content=service.reconciliation_csv(report),
        media_type="text/csv",
        headers={
            "Content-Disposition": (
                f'attachment; filename="reconciliation-{start_date}-{end_date}.csv"'
            )
        },
    )
