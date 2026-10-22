"""Barrels Events organiser desk: /api/v1/events/org/... (ADR-0025 org zone).

Acts for the organisation in ``X-Barrels-Organisation``. Each route needs an
organisation-bound Events key (ADR-0044) held through the member's role or a live
grant (owners and admins hold them all), the ``events`` entitlement, and an
account or Events app session (ADR-0016 amendment). Keys are resolved only through
``require_org_permission_or_staff``, never ``has_permission``. An event or order of
another organisation answers 404.

Barrels staff may use the same routes through an explicit staff path (ADR-0050):
each route names one (organisation key, staff key) pair in ``ROUTE_KEYS``, a staff
caller holds the staff key through a role (never implied for a superuser), and its
history rows record ``actor_capacity = 'staff'``. Staff reads of orders are logged
at INFO with ids only.

Money moves through the payments core. The two money writes a client may retry
(manual payment, refund) need an ``Idempotency-Key``; cancelling is protected by
the order's state (a repeat is a 409).
"""

import logging
import uuid
from collections.abc import Awaitable, Callable
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response, status
from pydantic import BaseModel as PydanticModel

from src import idempotency
from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations.dependencies import (
    EventsActor,
    has_staff_access,
    require_org_permission_or_staff,
)
from src.organisations.exceptions import OrganisationPermissionError
from src.organisations.models import MembershipRole
from src.pagination import PaginatedResponse, PaginationDep

from . import schemas, service
from .service import org_orders

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/events/org", tags=["events"])

STAFF_WRITE_LIMIT_MONEY = "20/minute"
STAFF_WRITE_LIMIT_TILL = "120/minute"
STAFF_READ_LIMIT = "120/minute"

#: Every org-zone route -> exactly one (organisation key, staff key) pair. The
#: registry test checks this against the router's real dependencies.
ROUTE_KEYS: dict[str, tuple[str, str]] = {
    "eventsOrgListOrders": ("events.settlement.view", "events.ops.settlement"),
    "eventsOrgGetOrder": ("events.settlement.view", "events.ops.settlement"),
    "eventsOrgListAttendees": ("events.door.scan", "events.ops.door"),
    "eventsOrgRecordManualPayment": ("events.tickets.sell", "events.ops.till"),
    "eventsOrgRefundOrder": ("events.refunds.issue", "events.ops.refunds"),
    "eventsOrgCancelOrder": ("events.refunds.issue", "events.ops.refunds"),
    "eventsOrgCancelEvent": ("events.listings.manage", "events.ops.listings"),
    "eventsOrgGetWorkspace": ("events.listings.manage", "events.ops.listings"),
    "eventsOrgCreateListing": ("events.listings.manage", "events.ops.listings"),
    "eventsOrgUpdateListing": ("events.listings.manage", "events.ops.listings"),
    "eventsOrgPostponeEvent": ("events.listings.manage", "events.ops.listings"),
    "eventsOrgSetOrganiserLogo": ("events.listings.manage", "events.ops.listings"),
    "eventsOrgGetListingActivity": ("events.listings.manage", "events.ops.listings"),
}


def _sees_email(org: EventsActor) -> bool:
    """Buyer account emails go to the organisation's admins and owners, and to
    Barrels staff acting through the staff path (owner decision, ADR-0050), not to
    members holding a grant. Staff reads are logged (``_log_staff_read``)."""
    return org.is_staff or org.role in (MembershipRole.ADMIN, MembershipRole.OWNER)


def _log_staff_read(org: EventsActor, what: str, listing_id: uuid.UUID) -> None:
    if org.is_staff:
        logger.info(
            "Staff read of organiser data",
            extra={
                "what": what,
                "user_id": str(org.user.id),
                "organisation_id": org.organisation_id,
                "listing_id": str(listing_id),
            },
        )


def _key(permission_key: str, *, staff_limit: str | None = None) -> Any:
    staff_key = next(
        staff for org_key, staff in ROUTE_KEYS.values() if org_key == permission_key
    )
    return Depends(
        require_org_permission_or_staff(
            permission_key, staff_key, session_app="events", staff_limit=staff_limit
        )
    )


OrgCanSeeOrders = Annotated[
    EventsActor, _key("events.settlement.view", staff_limit=STAFF_READ_LIMIT)
]
OrgCanSeeAttendees = Annotated[
    EventsActor, _key("events.door.scan", staff_limit=STAFF_READ_LIMIT)
]
OrgCanTakePayment = Annotated[
    EventsActor, _key("events.tickets.sell", staff_limit=STAFF_WRITE_LIMIT_TILL)
]
OrgCanRefund = Annotated[
    EventsActor, _key("events.refunds.issue", staff_limit=STAFF_WRITE_LIMIT_MONEY)
]
OrgCanManageEvents = Annotated[
    EventsActor, _key("events.listings.manage", staff_limit=STAFF_WRITE_LIMIT_MONEY)
]

OrgCanReadListings = Annotated[
    EventsActor, _key("events.listings.manage", staff_limit=STAFF_READ_LIMIT)
]

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
    _log_staff_read(org, "orders.list", listing_id)
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
    _log_staff_read(org, "attendees.list", listing_id)
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
    if org.is_staff and body.refund != "none":
        # events.ops.listings alone must not move money: a refunding cancel also
        # needs events.ops.refunds (the manager role deliberately lacks it).
        if not await has_staff_access(session, org.user, "events.ops.refunds"):
            raise OrganisationPermissionError()
    async with org_orders.conflict_on_deadlock(session):
        return await service.cancel_event_for_organisation(
            session, org.user, org.organisation_id, listing_id, body.refund
        )


# --- Listing management (legacy /events/manage/* family, slice L1) ----------------------
# The organisation has exactly one organiser (``organisers.organisation_id`` is
# unique), so there is no ``?organiser=`` here: it is resolved from the header.


@router.get(
    "/workspace",
    response_model=schemas.ManagedOrganiser,
    summary="Get the organisation's organiser workspace",
    description=(
        "The organiser backing the organisation and all its listings, drafts "
        "included. 404 when the organisation has no organiser yet."
    ),
    operation_id="eventsOrgGetWorkspace",
    responses=READ_ERRORS,
)
async def get_workspace(*, session: SessionDep, org: OrgCanReadListings) -> Any:
    organiser = await service.organiser_of_organisation(session, org.organisation_id)
    return await service.managed_workspace(session, org.user, organiser, [organiser])


@router.post(
    "/listings",
    response_model=schemas.ManagedListing,
    status_code=status.HTTP_201_CREATED,
    summary="Create an event listing",
    description=(
        "Create a draft or published listing with ticket tiers for the organisation's "
        "organiser. Only a verified organiser can publish (403)."
    ),
    operation_id="eventsOrgCreateListing",
    responses={**WRITE_ERRORS, 403: {"description": "Not allowed to publish"}},
)
async def create_listing(
    *, session: SessionDep, org: OrgCanManageEvents, body: schemas.ListingUpsert
) -> Any:
    organiser = await service.organiser_of_organisation(session, org.organisation_id)
    return await service.create_listing_for(session, org.user, body, organiser)


@router.put(
    "/listings/{listing_id}",
    response_model=schemas.ManagedListing,
    summary="Update an event listing",
    description=(
        "Replace a listing's details and tiers. Saving with status `cancelled` "
        "cancels the event without moving money; use the cancel route to refund."
    ),
    operation_id="eventsOrgUpdateListing",
    responses={**WRITE_ERRORS, 403: {"description": "Not allowed to publish"}},
)
async def update_listing(
    *,
    session: SessionDep,
    org: OrgCanManageEvents,
    listing_id: uuid.UUID,
    body: schemas.ListingUpsert,
) -> Any:
    organiser = await service.organiser_of_organisation(session, org.organisation_id)
    async with org_orders.conflict_on_deadlock(session):
        return await service.update_listing_for(
            session, org.user, listing_id, body, organiser
        )


@router.post(
    "/events/{listing_id}/postpone",
    response_model=schemas.PostponeResult,
    summary="Postpone an event",
    description="Move a published event to new times. Tickets stay valid and holders are notified.",
    operation_id="eventsOrgPostponeEvent",
    responses=WRITE_ERRORS,
)
async def postpone_event(
    *,
    session: SessionDep,
    org: OrgCanManageEvents,
    listing_id: uuid.UUID,
    body: schemas.PostponeEvent,
) -> Any:
    organiser = await service.organiser_of_organisation(session, org.organisation_id)
    return await service.postpone_event_for_organiser(
        session, org.user, organiser, listing_id, body
    )


@router.put(
    "/organiser/logo",
    response_model=schemas.OrganiserPublic,
    summary="Set the organiser logo",
    description=(
        "Attach a completed `organiser-logo` upload of the organisation, or send "
        "null to clear it."
    ),
    operation_id="eventsOrgSetOrganiserLogo",
    responses=WRITE_ERRORS,
)
async def set_organiser_logo(
    *, session: SessionDep, org: OrgCanManageEvents, body: schemas.OrganiserLogoUpdate
) -> Any:
    organiser = await service.organiser_of_organisation(session, org.organisation_id)
    return await service.set_organiser_logo_for(
        session, org.user, body.file_id, organiser
    )


@router.get(
    "/events/{listing_id}/activity",
    response_model=list[schemas.ActivityEntry],
    summary="Get a listing's activity history",
    description=(
        "Append-only record of who changed the listing and what, newest first. "
        "Barrels staff entries show as `staff`."
    ),
    operation_id="eventsOrgGetListingActivity",
    responses=READ_ERRORS,
)
async def get_listing_activity(
    *,
    session: SessionDep,
    org: OrgCanReadListings,
    listing_id: uuid.UUID,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
) -> Any:
    organiser = await service.organiser_of_organisation(session, org.organisation_id)
    return await service.listing_activity_for(session, organiser, listing_id, limit)


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
    detail = await org_orders.get_order(
        session, org.organisation_id, order_id, _sees_email(org)
    )
    _log_staff_read(org, "orders.get", detail.listing_id)
    return detail


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
            session, org.organisation_id, org.user, order_id, body, _sees_email(org)
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
        "full refund cancels the tickets and marks the order `refunded`. "
        "A card refund is queued for the payment provider (see `refund_status`); a second "
        "refund for the same order is 409 while one is waiting. Requires an "
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
            session,
            org.organisation_id,
            org.user,
            order_id,
            body,
            idempotency_key,
            _sees_email(org),
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
            session, org.organisation_id, org.user, order_id, body, _sees_email(org)
        )
        await session.commit()
    return result


async def _run(
    response: Response,
    session: SessionDep,
    org: EventsActor,
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
            request_body={
                "order_id": str(order_id),
                "show_email": _sees_email(org),
                **body.model_dump(mode="json"),
            },
            handler=handler,
        )
        await session.commit()
    response.status_code = result.status_code
    if result.replayed:
        response.headers["Idempotency-Replayed"] = "true"
    return result.body
