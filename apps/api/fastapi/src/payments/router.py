"""Payments routes (ADR-0027, ADR-0025 zones).

- ``org``: organisation admins with the ``payments`` entitlement create intents,
  record manual payments and refund. Other organisations' payments answer 404.
- ``public``: provider callbacks, authenticated by signature, never by session.
- ``admin``: superusers reconcile, pay out and see everything.

Routers commit; service functions flush.
"""

import uuid
from datetime import date
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query, Request, Response, status
from fastapi.responses import RedirectResponse

from src.auth.policy import require_permission
from src.dependencies import AdminUser, CurrentUser, SessionDep
from src.models import ApiError
from src.openapi_responses import (
    AUTHENTICATED,
    BAD_REQUEST,
    CONFLICT,
    NOT_FOUND,
    ResponseMap,
)
from src.organisations.dependencies import (
    OrgContext,
    require_org_app,
    require_org_permission,
)
from src.organisations.models import MembershipRole
from src.pagination import PaginationDep

from . import merchant_accounts, schemas, service
from .connect import accounts as connect_accounts
from .connect import disputes as connect_disputes
from .connect import webhook as connect_webhook
from .models import IntentStatus, LedgerKind

#: The online providers a business sets up for itself (the rest are platform rails).
MerchantProvider = Literal["wipay"]

router = APIRouter(prefix="/payments", tags=["payments"])

# Organisation routes require the "payments" entitlement (org.organisation_app).
PaymentsOrgAdmin = Annotated[
    OrgContext, Depends(require_org_app("payments", MembershipRole.ADMIN))
]
# Stripe Connect set-up for the business: owners and admins hold the key by default.
ConnectOrgManager = Annotated[
    OrgContext, Depends(require_org_permission("payments.connect.manage"))
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


@router.get(
    "/org/merchant-accounts",
    response_model=schemas.MerchantAccountListPublic,
    summary="List the business's own payment accounts",
    description=(
        "Each online provider the business set up, with its environment and switches. "
        "Never returns a credential."
    ),
    operation_id="paymentsListMerchantAccounts",
    responses={**AUTHENTICATED},
)
async def list_merchant_accounts(*, session: SessionDep, org: PaymentsOrgAdmin) -> Any:
    return schemas.MerchantAccountListPublic(
        data=await merchant_accounts.list_accounts(session, org.organisation_id)
    )


@router.put(
    "/org/merchant-accounts/{provider}",
    response_model=schemas.MerchantAccountPublic,
    summary="Save the business's own WiPay account",
    description=(
        "Stores the business's WiPay account number, API key and webhook secret, "
        "encrypted. A blank secret keeps the stored one. 503 while the platform has no "
        "secret keys. Live payments need the owner's approval before a checkout starts."
    ),
    operation_id="paymentsSaveMerchantAccount",
    responses={**WRITE_ERRORS, **_UNAVAILABLE},
)
async def save_merchant_account(
    *,
    session: SessionDep,
    org: PaymentsOrgAdmin,
    provider: MerchantProvider,  # noqa: ARG001  (the route's path; WiPay is the only one)
    payload: schemas.MerchantAccountUpsert,
) -> Any:
    result = await merchant_accounts.save(
        session, organisation_id=org.organisation_id, actor=org.user, payload=payload
    )
    await session.commit()
    return result


# --- provider callbacks ---------------------------------------------------------------


@router.post(
    "/org/connect/onboarding-links",
    response_model=schemas.ConnectOnboardingLinkPublic,
    summary="Start or resume Stripe onboarding",
    description=(
        "Creates the business's connected Stripe account on first use (New Zealand, the "
        "business as seller, full Stripe Dashboard) and returns a hosted onboarding link. "
        "Test mode only."
    ),
    operation_id="paymentsCreateConnectOnboardingLink",
    responses={**AUTHENTICATED, **_UNAVAILABLE, **_BAD_GATEWAY},
)
async def create_connect_onboarding_link(
    *, session: SessionDep, org: ConnectOrgManager
) -> Any:
    account_id = await connect_accounts.ensure_account(
        session, organisation_id=org.organisation_id
    )
    # Save the account before asking Stripe for a link: if the link request fails,
    # the account is kept and the retry reuses it.
    await session.commit()
    url = await connect_accounts.onboarding_link(account_id)
    return schemas.ConnectOnboardingLinkPublic(url=url)


@router.get(
    "/org/connect",
    response_model=schemas.ConnectStatusPublic,
    summary="Card payment set-up status",
    description=(
        "Whether the business can take card payments, what Stripe still needs from it, and "
        "the platform fee. Reads Stripe when the business has an account; `synced` is false "
        "when Stripe could not be read and the last stored state is shown."
    ),
    operation_id="paymentsGetConnectStatus",
    responses={**AUTHENTICATED, **_UNAVAILABLE},
)
async def get_connect_status(*, session: SessionDep, org: ConnectOrgManager) -> Any:
    result = await connect_accounts.status_for(
        session, organisation_id=org.organisation_id
    )
    await session.commit()
    return result


@router.get(
    "/org/disputes",
    response_model=schemas.DisputeListPublic,
    summary="Card disputes against the organisation",
    description=(
        "Disputes Stripe reported on the business's payments, newest first. Barrels does "
        "not answer or reverse them; the business responds in its Stripe Dashboard."
    ),
    operation_id="paymentsListDisputes",
    responses={**AUTHENTICATED},
)
async def list_disputes(
    *, session: SessionDep, org: ConnectOrgManager, pagination: PaginationDep
) -> Any:
    rows, total = await connect_disputes.list_disputes(
        session,
        organisation_id=org.organisation_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return schemas.DisputeListPublic(
        data=rows, count=total, page=pagination.page, size=pagination.size
    )


# --- Stripe Connect webhook -----------------------------------------------------------


@router.post(
    "/public/webhooks/stripe-connect",
    response_model=schemas.PaymentCallbackAck,
    status_code=status.HTTP_200_OK,
    summary="Receive a Stripe Connect event",
    description=(
        "Events from connected accounts, verified with the Connect endpoint's own secret. "
        "Idempotent: a replayed event changes nothing and still answers 200."
    ),
    operation_id="paymentsReceiveConnectWebhook",
    responses={
        400: {"model": ApiError, "description": "Invalid or stale signature"},
        503: {"description": "Stripe Connect is not configured or is unsafe"},
    },
    include_in_schema=False,
)
async def receive_connect_webhook(*, session: SessionDep, request: Request) -> Any:
    body = await request.body()
    await connect_webhook.process_connect_webhook(
        session, headers=request.headers, body=body
    )
    await session.commit()
    return schemas.PaymentCallbackAck()


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
        400: {"model": ApiError, "description": "Invalid or stale signature"},
        404: {"model": ApiError, "description": "Unknown provider"},
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


@router.get(
    "/public/returns/wipay",
    status_code=status.HTTP_303_SEE_OTHER,
    summary="WiPay sends the customer back here",
    description=(
        "Verifies WiPay's hash for the payment, records it once, then redirects the "
        "customer to the business's own page. A return that does not verify changes "
        "nothing and answers 400."
    ),
    operation_id="paymentsWipayReturn",
    responses={
        400: {"model": ApiError, "description": "The return does not verify"},
        404: {"model": ApiError, "description": "Unknown payment"},
        503: {"description": "The business's WiPay account is not usable"},
    },
    include_in_schema=False,
)
async def wipay_return(*, session: SessionDep, request: Request) -> Any:
    target = await service.process_wipay_return(session, params=request.query_params)
    await session.commit()
    return RedirectResponse(url=target, status_code=status.HTTP_303_SEE_OTHER)


# --- administration -------------------------------------------------------------------


@router.post(
    "/admin/merchant-accounts/{organisation_id}/{provider}/live-approval",
    response_model=schemas.MerchantAccountPublic,
    summary="Approve or withdraw live payments for a business",
    description=(
        "The owner's switch. Approval needs a verified sandbox payment first (409 "
        "otherwise). Withdrawing it stops new live checkouts at once."
    ),
    operation_id="paymentsAdminSetLiveApproval",
    responses={**AUTHENTICATED, **CONFLICT},
)
async def admin_set_live_approval(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: str,
    provider: MerchantProvider,  # noqa: ARG001  (the route's path; WiPay is the only one)
    payload: schemas.MerchantLiveApproval,
) -> Any:
    require_permission(
        current_user=current_user, permission_key="payments.live.approve"
    )
    result = await merchant_accounts.set_live_approval(
        session,
        organisation_id=organisation_id,
        approved=payload.approved,
        actor=current_user,
    )
    await session.commit()
    return result


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
    "/admin/connect/accounts/{organisation_id}/platform-fee",
    response_model=schemas.ConnectFeePublic,
    summary="Set the Barrels platform fee for a business",
    description=(
        "The fee taken from each card payment, in basis points, at most the platform cap. "
        "New Zealand businesses only. The business keeps the rest and Stripe's own fees."
    ),
    operation_id="paymentsAdminSetPlatformFee",
    responses={**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND},
)
async def admin_set_platform_fee(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: str,
    payload: schemas.ConnectPlatformFeeUpdate,
) -> Any:
    require_permission(
        current_user=current_user, permission_key="payments.connect.fees"
    )
    row = await connect_accounts.set_platform_fee(
        session,
        organisation_id=organisation_id,
        fee_bps=payload.platform_fee_bps,
    )
    await session.commit()
    return connect_accounts.fee_public(row)


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
