"""Barrels Events organiser desk: /api/v1/events/org/... (ADR-0025 org zone).

Acts for the organisation in ``X-Barrels-Organisation``. Each route needs an
organisation-bound Events key (ADR-0044) held through the member's role or a live
grant (owners and admins hold them all), the ``events`` entitlement, and an
account or Events app session (ADR-0016 amendment). Keys are resolved only through
``require_org_permission``, never ``has_permission``. An event or order of another
organisation answers 404.

Money moves through the payments core. The two money writes a client may retry
(manual payment, refund) need an ``Idempotency-Key``; cancelling is protected by
the order's state (a repeat is a 409).
"""

import uuid
from collections.abc import Awaitable, Callable
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel as PydanticModel

from src import idempotency
from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations.dependencies import OrgContext, require_org_permission
from src.pagination import PaginatedResponse, PaginationDep

from . import schemas, service
from .service import org_orders

router = APIRouter(prefix="/events/org", tags=["events"])


def _key(permission_key: str) -> Any:
    return Depends(require_org_permission(permission_key, session_app="events"))


OrgCanSeeOrders = Annotated[OrgContext, _key("events.settlement.view")]
OrgCanSeeAttendees = Annotated[OrgContext, _key("events.door.scan")]
OrgCanTakePayment = Annotated[OrgContext, _key("events.tickets.sell")]
OrgCanRefund = Annotated[OrgContext, _key("events.refunds.issue")]
OrgCanManageEvents = Annotated[OrgContext, _key("events.listings.manage")]

READ_ERRORS = {**AUTHENTICATED, **NOT_FOUND}
WRITE_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}


@router.get(
    "/events/{listing_id}/orders",
    response_model=PaginatedResponse[schemas.OrgOrderRow],
    summary="List an event's orders",
    description="Orders for one of the organisation's events, newest first, optionally by status.",
    operation_id="eventsOrgListOrders",
    responses=READ_ERRORS,
)
async def list_orders(
    *,
    session: SessionDep,
    org: OrgCanSeeOrders,
    pagination: PaginationDep,
    listing_id: uuid.UUID,
    order_status: Annotated[
        schemas.OrgOrderStatus | None, Query(alias="status")
    ] = None,
) -> Any:
    return await org_orders.list_orders(
        session,
        org.organisation_id,
        listing_id,
        status=order_status,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/events/{listing_id}/attendees",
    response_model=PaginatedResponse[schemas.OrgAttendee],
    summary="List an event's attendees",
    description="Tickets for one of the organisation's events with holder, tier and door admission time.",
    operation_id="eventsOrgListAttendees",
    responses=READ_ERRORS,
)
async def list_attendees(
    *,
    session: SessionDep,
    org: OrgCanSeeAttendees,
    pagination: PaginationDep,
    listing_id: uuid.UUID,
    ticket_status: Annotated[
        schemas.OrgTicketStatus | None, Query(alias="status")
    ] = None,
    tier_id: uuid.UUID | None = None,
) -> Any:
    return await org_orders.list_attendees(
        session,
        org.organisation_id,
        listing_id,
        status=ticket_status,
        tier_id=tier_id,
        page=pagination.page,
        size=pagination.size,
    )


@router.post(
    "/events/{listing_id}/cancel",
    response_model=schemas.CancelResult,
    summary="Cancel an event",
    description=(
        "Cancels a published event: every valid ticket is cancelled and members are "
        "notified. `refund` decides the money already paid online: `full`, `none` or "
        "`follow_policy` (default; an organiser-cancelled event is refunded in full). "
        "A refund that fails is counted in `refunds_failed` and can be retried from "
        "the order; it never undoes the cancel."
    ),
    operation_id="eventsOrgCancelEvent",
    responses=WRITE_ERRORS,
)
async def cancel_event(
    *,
    session: SessionDep,
    org: OrgCanManageEvents,
    listing_id: uuid.UUID,
    body: schemas.OrgEventCancel,
) -> Any:
    async with org_orders.conflict_on_deadlock(session):
        return await service.cancel_event_for_organisation(
            session, org.user, org.organisation_id, listing_id, body.refund
        )


@router.get(
    "/orders/{order_id}",
    response_model=schemas.OrgOrderDetail,
    summary="Get an order",
    description="One order with items, tickets, buyer contact and the payment ledger totals.",
    operation_id="eventsOrgGetOrder",
    responses=READ_ERRORS,
)
async def get_order(
    *, session: SessionDep, org: OrgCanSeeOrders, order_id: uuid.UUID
) -> Any:
    return await org_orders.get_order(session, org.organisation_id, order_id)


@router.post(
    "/orders/{order_id}/manual-payments",
    response_model=schemas.OrgOrderDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Record a cash or bank payment for an order",
    description=(
        "Staff received the money outside the card rail. The order must be "
        "`pending_payment`; it becomes `confirmed` and its tickets are issued now. "
        "Requires an `Idempotency-Key` header (same key and body replays the first "
        "answer with `Idempotency-Replayed: true`). Recorded in the event's history."
    ),
    operation_id="eventsOrgRecordManualPayment",
    responses=WRITE_ERRORS,
)
async def record_manual_payment(
    *,
    response: Response,
    session: SessionDep,
    org: OrgCanTakePayment,
    order_id: uuid.UUID,
    body: schemas.OrgManualPaymentCreate,
    idempotency_key: idempotency.RequiredIdempotencyKey,
) -> Any:
    async def once() -> tuple[int, dict[str, Any]]:
        detail = await org_orders.record_payment(
            session, org.organisation_id, org.user, order_id, body
        )
        return 201, detail.model_dump(mode="json")

    return await _run(
        response, session, org, order_id, idempotency_key, body, once, "payment"
    )


@router.post(
    "/orders/{order_id}/refunds",
    response_model=schemas.OrgOrderDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Refund an order",
    description=(
        "Hands back money for a paid online order: all of it, or `amount_minor`. A "
        "full refund cancels the tickets and marks the order `refunded`. Requires an "
        "`Idempotency-Key` header (replays the first answer with "
        "`Idempotency-Replayed: true`)."
    ),
    operation_id="eventsOrgRefundOrder",
    responses=WRITE_ERRORS,
)
async def refund_order(
    *,
    response: Response,
    session: SessionDep,
    org: OrgCanRefund,
    order_id: uuid.UUID,
    body: schemas.OrgOrderRefundCreate,
    idempotency_key: idempotency.RequiredIdempotencyKey,
) -> Any:
    async def once() -> tuple[int, dict[str, Any]]:
        detail = await org_orders.refund_order(
            session, org.organisation_id, org.user, order_id, body, idempotency_key
        )
        return 201, detail.model_dump(mode="json")

    return await _run(
        response, session, org, order_id, idempotency_key, body, once, "refund"
    )


@router.post(
    "/orders/{order_id}/cancel",
    response_model=schemas.OrgOrderCancelResult,
    summary="Cancel an order",
    description=(
        "Cancels one order: its tickets stop working and the seats go back on sale. "
        "`refund` is `full`, `none` or `follow_policy` (default: refunded when the "
        "event starts at least the policy cutoff away). A refund that fails aborts "
        "the cancel. Outlet cash orders can only be cancelled with `none`."
    ),
    operation_id="eventsOrgCancelOrder",
    responses=WRITE_ERRORS,
)
async def cancel_order(
    *,
    session: SessionDep,
    org: OrgCanRefund,
    order_id: uuid.UUID,
    body: schemas.OrgOrderCancel,
) -> Any:
    async with org_orders.conflict_on_deadlock(session):
        result = await org_orders.cancel_order(
            session, org.organisation_id, org.user, order_id, body
        )
        await session.commit()
    return result


async def _run(
    response: Response,
    session: SessionDep,
    org: OrgContext,
    order_id: uuid.UUID,
    key: str,
    body: PydanticModel,
    handler: Callable[[], Awaitable[tuple[int, dict[str, Any]]]],
    scope: str,
) -> dict[str, Any]:
    async with org_orders.conflict_on_deadlock(session):
        result = await idempotency.run_idempotent(
            session,
            scope=f"events.order-{scope}",
            organisation_id=org.organisation_id,
            key=key,
            request_body={"order_id": str(order_id), **body.model_dump(mode="json")},
            handler=handler,
        )
        await session.commit()
    response.status_code = result.status_code
    if result.replayed:
        response.headers["Idempotency-Replayed"] = "true"
    return result.body
