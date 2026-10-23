"""Bookings routes (ADR-0024).

Organisation routes (`/bookings/org/*`) act for the organisation in ``X-Barrels-Organisation``: members
read, admins and owners change. Public routes are keyed by a profile's
``public_slug`` and need no sign-in. Routers commit; service functions flush.
"""

import uuid
from datetime import date, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, Query, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials

from src import idempotency
from src.auth.models import User
from src.dependencies import SessionDep, TokenDep, optional_account
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations.api_key_auth import OrgAccess, org_or_key
from src.organisations.dependencies import (
    OrgContext,
    require_org_app,
    resolve_org_caller,
)
from src.organisations.models import MembershipRole
from src.rate_limit import limiter
from src.turnstile import require_turnstile

from . import public, service, studio
from .models import BookingStatus
from .schemas import (
    BookingAgenda,
    BookingAgendaItem,
    BookingAvailability,
    BookingEmailCodeConfirm,
    BookingEmailCodeRequest,
    BookingEmailCodeSent,
    BookingEmailProof,
    BookingExceptionCreate,
    BookingExceptionPublic,
    BookingManualDepositCreate,
    BookingMyOrganisation,
    BookingProfilePublic,
    BookingProfileUpdate,
    BookingProviderCreate,
    BookingProviderPublic,
    BookingProviderUpdate,
    BookingPublicCancel,
    BookingPublicCreate,
    BookingPublicDetail,
    BookingPublicReceipt,
    BookingPublicReschedule,
    BookingServiceCreate,
    BookingServicePublic,
    BookingServiceUpdate,
    BookingSlot,
    BookingStorefront,
    BookingStudioCancel,
    BookingStudioCreate,
    BookingStudioDecline,
    BookingStudioDetail,
    BookingWorkingHoursUpdate,
    BookingWorkingPeriodPublic,
)

router = APIRouter(prefix="/bookings", tags=["bookings"])


async def _studio_caller(session: SessionDep, token: TokenDep) -> User:
    """The signed-in user: an account token or the bookings app's own token."""
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    user, _ = await resolve_org_caller(session, credentials, "bookings")
    return user


StudioCaller = Annotated[User, Depends(_studio_caller)]


@router.get(
    "/me/organisations",
    response_model=list[BookingMyOrganisation],
    summary="The caller's organisations that use Barrels Bookings",
    description=(
        "Active memberships in active organisations entitled to bookings, with the "
        "caller's role; feeds the studio's organisation picker. Accepts an account "
        "or the bookings app session."
    ),
    operation_id="bookingsListMyOrganisations",
    responses=AUTHENTICATED,
)
async def list_my_organisations(*, session: SessionDep, user: StudioCaller) -> Any:
    rows = await service.list_my_organisations(session, user.id)
    return [
        BookingMyOrganisation(
            id=o.id, name=o.name, slug=o.slug, role=MembershipRole(role)
        )
        for o, role in rows
    ]


# Organisation routes require the "bookings" entitlement (org.organisation_app).
BookingsOrgMember = Annotated[
    OrgContext, Depends(require_org_app("bookings", session_app="bookings"))
]
BookingsOrgAdmin = Annotated[
    OrgContext,
    Depends(require_org_app("bookings", MembershipRole.ADMIN, session_app="bookings")),
]
# Organisation reads also accept an API key with `bookings.read` (PF5, ADR-0029),
# e.g. a kiosk or partner site; the user path behaves as BookingsOrgMember.
BookingsOrgRead = Annotated[
    OrgAccess, Depends(org_or_key("bookings", "bookings.read", session_app="bookings"))
]

# Studio actions also accept an API key with `bookings.write` (PF5); the member
# path needs the admin role. `actor_id` is None for a key.
BookingsOrgWrite = Annotated[
    OrgAccess,
    Depends(
        org_or_key(
            "bookings",
            "bookings.write",
            MembershipRole.ADMIN,
            session_app="bookings",
        )
    ),
]

# Money routes also need the organisation's `payments` entitlement.
PaymentsEntitled = Annotated[
    OrgContext,
    Depends(require_org_app("payments", MembershipRole.ADMIN, session_app="bookings")),
]

READ_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND}
WRITE_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}


# --- organisation: profile -----------------------------------------------------------------


@router.get(
    "/org/profile",
    response_model=BookingProfilePublic,
    summary="Get my booking profile",
    description="The organisation's booking page settings and rules.",
    operation_id="bookingsGetProfile",
    responses=READ_ERRORS,
)
async def get_profile(*, session: SessionDep, org: BookingsOrgRead) -> Any:
    return await service.get_profile(session, org.organisation_id)


@router.put(
    "/org/profile",
    response_model=BookingProfilePublic,
    summary="Create or update my booking profile",
    description=(
        "Set the public booking address, timezone, currency and booking rules. "
        "Online booking stays off until `enabled` is true."
    ),
    operation_id="bookingsUpsertProfile",
    responses=WRITE_ERRORS,
)
async def upsert_profile(
    *, session: SessionDep, org: BookingsOrgAdmin, payload: BookingProfileUpdate
) -> Any:
    profile = await service.upsert_profile(
        session, organisation_id=org.organisation_id, payload=payload
    )
    await session.commit()
    return profile


# --- organisation: services ----------------------------------------------------------------


@router.get(
    "/org/services",
    response_model=list[BookingServicePublic],
    summary="List my services",
    description="All services, active and inactive, in menu order.",
    operation_id="bookingsListServices",
    responses=READ_ERRORS,
)
async def list_services(*, session: SessionDep, org: BookingsOrgRead) -> Any:
    return await service.list_services(session, org.organisation_id)


@router.post(
    "/org/services",
    response_model=BookingServicePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a service",
    description="A bookable service with its duration, buffers, price and deposit.",
    operation_id="bookingsCreateService",
    responses=WRITE_ERRORS,
)
async def create_service(
    *, session: SessionDep, org: BookingsOrgAdmin, payload: BookingServiceCreate
) -> Any:
    row = await service.create_service(
        session, organisation_id=org.organisation_id, payload=payload
    )
    await session.commit()
    return row


@router.patch(
    "/org/services/{service_id}",
    response_model=BookingServicePublic,
    summary="Update a service",
    description="Change a service, or set `active` to false to stop new bookings.",
    operation_id="bookingsUpdateService",
    responses=WRITE_ERRORS,
)
async def update_service(
    *,
    session: SessionDep,
    org: BookingsOrgAdmin,
    service_id: uuid.UUID,
    payload: BookingServiceUpdate,
) -> Any:
    row = await service.get_service(
        session, service_id, organisation_id=org.organisation_id
    )
    await service.update_service(session, row, payload)
    await session.commit()
    return row


# --- organisation: providers, hours, time off ------------------------------------------------


@router.get(
    "/org/providers",
    response_model=list[BookingProviderPublic],
    summary="List my providers",
    description="People (or chairs, bays, rooms) who perform services.",
    operation_id="bookingsListProviders",
    responses=READ_ERRORS,
)
async def list_providers(*, session: SessionDep, org: BookingsOrgRead) -> Any:
    return await service.list_providers(session, org.organisation_id)


@router.post(
    "/org/providers",
    response_model=BookingProviderPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a provider",
    description="Add a provider and the services they perform.",
    operation_id="bookingsCreateProvider",
    responses=WRITE_ERRORS,
)
async def create_provider(
    *, session: SessionDep, org: BookingsOrgAdmin, payload: BookingProviderCreate
) -> Any:
    row = await service.create_provider(
        session, organisation_id=org.organisation_id, payload=payload
    )
    await session.commit()
    return row


@router.patch(
    "/org/providers/{provider_id}",
    response_model=BookingProviderPublic,
    summary="Update a provider",
    description="Rename, deactivate, or replace the services a provider performs.",
    operation_id="bookingsUpdateProvider",
    responses=WRITE_ERRORS,
)
async def update_provider(
    *,
    session: SessionDep,
    org: BookingsOrgAdmin,
    provider_id: uuid.UUID,
    payload: BookingProviderUpdate,
) -> Any:
    provider = await service.get_provider(
        session, provider_id, organisation_id=org.organisation_id
    )
    row = await service.update_provider(session, provider, payload)
    await session.commit()
    return row


@router.get(
    "/org/providers/{provider_id}/hours",
    response_model=list[BookingWorkingPeriodPublic],
    summary="Get a provider's weekly hours",
    description="Working periods per weekday (Monday = 0), in the profile's timezone.",
    operation_id="bookingsGetWorkingHours",
    responses=READ_ERRORS,
)
async def get_working_hours(
    *, session: SessionDep, org: BookingsOrgRead, provider_id: uuid.UUID
) -> Any:
    provider = await service.get_provider(
        session, provider_id, organisation_id=org.organisation_id
    )
    return await service.get_working_hours(session, provider)


@router.put(
    "/org/providers/{provider_id}/hours",
    response_model=list[BookingWorkingPeriodPublic],
    summary="Replace a provider's weekly hours",
    description=(
        "Send the whole week. Several periods on one day make breaks between "
        "them; a day with no periods is a day off."
    ),
    operation_id="bookingsReplaceWorkingHours",
    responses=WRITE_ERRORS,
)
async def replace_working_hours(
    *,
    session: SessionDep,
    org: BookingsOrgAdmin,
    provider_id: uuid.UUID,
    payload: BookingWorkingHoursUpdate,
) -> Any:
    provider = await service.get_provider(
        session, provider_id, organisation_id=org.organisation_id
    )
    rows = await service.replace_working_hours(session, provider, payload)
    await session.commit()
    return rows


@router.get(
    "/org/providers/{provider_id}/exceptions",
    response_model=list[BookingExceptionPublic],
    summary="List time off and extra hours",
    description="Dated changes to a provider's weekly hours, optionally in a range.",
    operation_id="bookingsListExceptions",
    responses=READ_ERRORS,
)
async def list_exceptions(
    *,
    session: SessionDep,
    org: BookingsOrgRead,
    provider_id: uuid.UUID,
    starts_from: datetime | None = None,
    ends_before: datetime | None = None,
) -> Any:
    provider = await service.get_provider(
        session, provider_id, organisation_id=org.organisation_id
    )
    return await service.list_exceptions(
        session, provider, starts_from=starts_from, ends_before=ends_before
    )


@router.post(
    "/org/providers/{provider_id}/exceptions",
    response_model=BookingExceptionPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add time off or extra hours",
    description="Block time (`time_off`) or open time outside the weekly plan (`extra_hours`).",
    operation_id="bookingsCreateException",
    responses=WRITE_ERRORS,
)
async def create_exception(
    *,
    session: SessionDep,
    org: BookingsOrgAdmin,
    provider_id: uuid.UUID,
    payload: BookingExceptionCreate,
) -> Any:
    provider = await service.get_provider(
        session, provider_id, organisation_id=org.organisation_id
    )
    row = await service.create_exception(session, provider, payload)
    await session.commit()
    return row


@router.delete(
    "/org/exceptions/{exception_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove time off or extra hours",
    description="Delete one dated exception.",
    operation_id="bookingsDeleteException",
    responses=WRITE_ERRORS,
)
async def delete_exception(
    *, session: SessionDep, org: BookingsOrgAdmin, exception_id: uuid.UUID
) -> None:
    await service.delete_exception(
        session, exception_id, organisation_id=org.organisation_id
    )
    await session.commit()


@router.get(
    "/org/bookings",
    response_model=list[BookingAgendaItem],
    summary="List bookings in a period",
    description="The agenda: bookings overlapping the range, earliest first.",
    operation_id="bookingsListStudioBookings",
    responses=READ_ERRORS,
)
async def list_bookings(
    *,
    session: SessionDep,
    org: BookingsOrgRead,
    starts_from: datetime,
    ends_before: datetime,
) -> Any:
    return await service.list_bookings(
        session,
        org.organisation_id,
        starts_from=starts_from,
        ends_before=ends_before,
    )


# --- organisation: studio actions (B5) -------------------------------------------------

BookingId = Annotated[uuid.UUID, Path(description="The booking's id.")]


@router.get(
    "/org/agenda",
    response_model=BookingAgenda,
    summary="Get the agenda grouped by day",
    description=(
        "Bookings starting on the local days `from_date` to `to_date` (inclusive, "
        "at most 62 days), grouped by day in the profile's timezone, optionally "
        "for one provider or some statuses. Page with `limit` and `offset`."
    ),
    operation_id="bookingsGetAgenda",
    responses=READ_ERRORS,
)
async def get_agenda(
    *,
    session: SessionDep,
    org: BookingsOrgRead,
    from_date: date,
    to_date: date,
    provider_id: uuid.UUID | None = Query(default=None),
    status_filter: Annotated[list[BookingStatus] | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 200,
    offset: Annotated[int, Query(ge=0, le=100_000)] = 0,
) -> Any:
    return await studio.agenda(
        session,
        org.organisation_id,
        from_date=from_date,
        to_date=to_date,
        provider_id=provider_id,
        statuses=status_filter,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/org/bookings/{booking_id}",
    response_model=BookingStudioDetail,
    summary="Get a booking",
    description=(
        "The full studio view: customer name, phone and email, the deposit "
        "state and the booking's history."
    ),
    operation_id="bookingsGetStudioBooking",
    responses=READ_ERRORS,
)
async def get_studio_booking(
    *, session: SessionDep, org: BookingsOrgRead, booking_id: BookingId
) -> Any:
    return await studio.get_detail(session, org.organisation_id, booking_id)


@router.post(
    "/org/bookings",
    response_model=BookingStudioDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Enter a booking for a customer",
    description=(
        "The business books a slot itself: a phone call, a walk-in or an "
        "appointment re-entered from another system. Requires an "
        "`Idempotency-Key` header (same key and body replays the first answer "
        "with `Idempotency-Replayed: true`, same key with another body is 409). "
        "The booking is `confirmed` with no deposit and is never limited by "
        "lead time, horizon or weekly hours, but a provider's time cannot be "
        "double-booked (409). `customer_email` is optional; the customer is "
        "emailed only when `send_confirmation` is true."
    ),
    operation_id="bookingsCreateStudioBooking",
    responses=WRITE_ERRORS,
)
async def create_studio_booking(
    *,
    response: Response,
    session: SessionDep,
    org: BookingsOrgWrite,
    payload: BookingStudioCreate,
    idempotency_key: idempotency.RequiredIdempotencyKey,
) -> Any:
    async def create_once() -> tuple[int, dict[str, Any]]:
        return await studio.create_booking(
            session, org.organisation_id, payload, actor_user_id=org.actor_id
        )

    result = await idempotency.run_idempotent(
        session,
        scope="bookings.studio-create",
        organisation_id=org.organisation_id,
        key=idempotency_key,
        request_body=payload.model_dump(mode="json"),
        handler=create_once,
    )
    await session.commit()
    response.status_code = result.status_code
    if result.replayed:
        response.headers["Idempotency-Replayed"] = "true"
    return result.body


@router.post(
    "/org/bookings/{booking_id}/confirm",
    response_model=BookingStudioDetail,
    summary="Confirm a booking request",
    description=(
        "Moves a `pending` booking to `confirmed` and emails the customer. 409 "
        "for any other status, including one still waiting for its deposit."
    ),
    operation_id="bookingsConfirmStudioBooking",
    responses=WRITE_ERRORS,
)
async def confirm_studio_booking(
    *, session: SessionDep, org: BookingsOrgWrite, booking_id: BookingId
) -> Any:
    result = await studio.confirm(
        session, org.organisation_id, booking_id, actor_user_id=org.actor_id
    )
    await session.commit()
    return result


@router.post(
    "/org/bookings/{booking_id}/manual-deposit",
    response_model=BookingStudioDetail,
    summary="Record a deposit taken outside Stripe",
    description=(
        "Owner or admin records a deposit paid in cash, by bank transfer or by "
        "cheque. Requires an `Idempotency-Key` header (same key and body replays "
        "the first answer with `Idempotency-Replayed: true`, same key with "
        "another body is 409). The booking's deposit is captured through the "
        "payments manual rail, so `deposit_captured_minor` in the detail shows "
        "it and a `pending_payment` booking is confirmed. 409 when the booking "
        "has no deposit, is closed, its deposit is already paid, or an online payment is still open. Needs the `payments` entitlement too. API keys "
        "are not accepted."
    ),
    operation_id="bookingsRecordManualDeposit",
    responses=WRITE_ERRORS,
)
async def record_manual_deposit(
    *,
    response: Response,
    session: SessionDep,
    org: BookingsOrgAdmin,
    _payments: PaymentsEntitled,
    booking_id: BookingId,
    payload: BookingManualDepositCreate,
    idempotency_key: idempotency.RequiredIdempotencyKey,
) -> Any:
    async def record_once() -> tuple[int, dict[str, Any]]:
        return await studio.record_manual_deposit(
            session, org.organisation_id, booking_id, payload, actor=org.user
        )

    result = await idempotency.run_idempotent(
        session,
        scope="bookings.manual-deposit",
        organisation_id=org.organisation_id,
        key=idempotency_key,
        request_body={**payload.model_dump(mode="json"), "booking_id": str(booking_id)},
        handler=record_once,
    )
    await session.commit()
    response.status_code = result.status_code
    if result.replayed:
        response.headers["Idempotency-Replayed"] = "true"
    return result.body


@router.post(
    "/org/bookings/{booking_id}/decline",
    response_model=BookingStudioDetail,
    summary="Decline a booking request",
    description=(
        "Cancels a `pending` request with a reason, releases the slot, refunds "
        "any captured deposit and emails the customer. 409 for any other status."
    ),
    operation_id="bookingsDeclineStudioBooking",
    responses=WRITE_ERRORS,
)
async def decline_studio_booking(
    *,
    session: SessionDep,
    org: BookingsOrgWrite,
    booking_id: BookingId,
    payload: BookingStudioDecline,
) -> Any:
    result = await studio.decline(
        session,
        org.organisation_id,
        booking_id,
        actor_user_id=org.actor_id,
        reason=payload.reason,
    )
    await session.commit()
    return result


@router.post(
    "/org/bookings/{booking_id}/cancel",
    response_model=BookingStudioDetail,
    summary="Cancel a booking as the business",
    description=(
        "Cancels an active booking with a reason, releases the slot and emails "
        "the customer. A captured deposit is refunded unless the booking starts "
        "inside `cancel_cutoff_hours`; `refund_deposit` overrides that. 409 when "
        "the booking is already finished."
    ),
    operation_id="bookingsCancelStudioBooking",
    responses=WRITE_ERRORS,
)
async def cancel_studio_booking(
    *,
    session: SessionDep,
    org: BookingsOrgWrite,
    booking_id: BookingId,
    payload: BookingStudioCancel,
) -> Any:
    result = await studio.cancel(
        session,
        org.organisation_id,
        booking_id,
        actor_user_id=org.actor_id,
        reason=payload.reason,
        refund_deposit=payload.refund_deposit,
    )
    await session.commit()
    return result


@router.post(
    "/org/bookings/{booking_id}/no-show",
    response_model=BookingStudioDetail,
    summary="Mark a booking as a no-show",
    description="Moves a `confirmed` booking to `no_show`. 409 for any other status.",
    operation_id="bookingsNoShowStudioBooking",
    responses=WRITE_ERRORS,
)
async def no_show_studio_booking(
    *, session: SessionDep, org: BookingsOrgWrite, booking_id: BookingId
) -> Any:
    result = await studio.no_show(
        session, org.organisation_id, booking_id, actor_user_id=org.actor_id
    )
    await session.commit()
    return result


@router.post(
    "/org/bookings/{booking_id}/complete",
    response_model=BookingStudioDetail,
    summary="Mark a booking as completed",
    description=(
        "Moves a `confirmed` booking to `completed` and queues the customer's "
        "reward when they have a linked account. 409 for any other status."
    ),
    operation_id="bookingsCompleteStudioBooking",
    responses=WRITE_ERRORS,
)
async def complete_studio_booking(
    *, session: SessionDep, org: BookingsOrgWrite, booking_id: BookingId
) -> Any:
    result = await studio.complete(
        session, org.organisation_id, booking_id, actor_user_id=org.actor_id
    )
    await session.commit()
    return result


# --- public ----------------------------------------------------------------------------


@router.get(
    "/public/{slug}",
    response_model=BookingStorefront,
    summary="Get a business's booking page",
    description=(
        "Active services and providers for a public booking page. Unknown and "
        "disabled pages both answer 404."
    ),
    operation_id="bookingsGetStorefront",
    responses={**NOT_FOUND},
)
@limiter.limit("60/minute")
async def get_storefront(*, request: Request, session: SessionDep, slug: str) -> Any:
    _ = request
    profile = await service.get_public_profile(session, slug)
    return await service.storefront(session, profile)


@router.get(
    "/public/{slug}/availability",
    response_model=BookingAvailability,
    summary="List open booking slots",
    description=(
        "Open start times for a service between two local dates (at most 14 "
        "days), optionally for one provider. Times are UTC; `timezone` is the "
        "business's local zone for display."
    ),
    operation_id="bookingsGetAvailability",
    responses={**BAD_REQUEST, **NOT_FOUND},
)
@limiter.limit("60/minute")
async def get_availability(
    *,
    request: Request,
    session: SessionDep,
    slug: str,
    service_id: uuid.UUID,
    first_day: date,
    last_day: date,
    provider_id: uuid.UUID | None = Query(default=None),
) -> Any:
    _ = request
    profile = await service.get_public_profile(session, slug)
    slots = await service.available_slots(
        session,
        profile,
        service_id=service_id,
        provider_id=provider_id,
        first_day=first_day,
        last_day=last_day,
    )
    return BookingAvailability(
        timezone=profile.timezone,
        service_id=service_id,
        slots=[
            BookingSlot(
                starts_at=slot.starts_at,
                ends_at=slot.ends_at,
                provider_ids=[uuid.UUID(pid) for pid in slot.provider_ids],
            )
            for slot in slots
        ],
    )


# --- public bookings (B3) ---------------------------------------------------------------

ManageToken = Annotated[
    str,
    Path(
        min_length=16,
        max_length=100,
        description="The manage token returned when the booking was made.",
    ),
]


@router.post(
    "/public/{slug}/bookings",
    response_model=BookingPublicReceipt,
    status_code=status.HTTP_201_CREATED,
    summary="Book a slot",
    description=(
        "Books an open slot without an account. Requires an `Idempotency-Key` "
        "header: repeating the request with the same key and body replays the "
        "first answer (header `Idempotency-Replayed: true`), the same key with a "
        "different body is 409. Applies the organisation's Turnstile policy. "
        "A slot that was taken answers 409. The response carries the manage "
        "token once; only its hash is stored. Confirmation emails are queued on "
        "the outbox. Unknown, disabled and unentitled pages answer 404."
    ),
    operation_id="bookingsCreatePublicBooking",
    responses={
        **BAD_REQUEST,
        **NOT_FOUND,
        **CONFLICT,
        403: {
            "description": (
                "A deposit is due and the email is not verified: no valid "
                "`email_proof` and no signed-in account vouching for it "
                "(`email_verification_required`)"
            )
        },
    },
)
@limiter.limit("10/minute")
async def create_public_booking(
    *,
    request: Request,
    response: Response,
    session: SessionDep,
    slug: Annotated[str, Path(max_length=60)],
    payload: BookingPublicCreate,
    idempotency_key: idempotency.RequiredIdempotencyKey,
) -> Any:
    profile = await service.get_public_profile(session, slug)
    policy = await public.turnstile_policy(session, profile)
    if payload.website:
        # Honeypot: look successful, store nothing.
        public.logger.info("Booking honeypot tripped; dropped")
        return public.decoy_receipt(profile, payload)

    async def create_once() -> tuple[int, dict[str, Any]]:
        # Turnstile tokens are single-use, so the check runs only for a key the
        # server has not seen: a client retrying after a lost response replays
        # its stored receipt instead of failing a second verification. A failed
        # check is not stored and releases the key.
        await require_turnstile(request, payload.turnstile_token, policy)
        payer = await optional_account(request, session, app="bookings")
        return await public.create_booking(session, profile, payload, payer=payer)

    result = await idempotency.run_idempotent(
        session,
        scope="bookings.create",
        organisation_id=profile.organisation_id,
        key=idempotency_key,
        request_body=payload.model_dump(
            mode="json", exclude={"turnstile_token", "website", "email_proof"}
        ),
        handler=create_once,
    )
    await session.commit()
    response.status_code = result.status_code
    if result.replayed:
        response.headers["Idempotency-Replayed"] = "true"
    return result.body


@router.post(
    "/public/{slug}/email-code",
    response_model=BookingEmailCodeSent,
    summary="Email a verification code before a deposit booking",
    description=(
        "When a deposit is due for the service, emails a 6-digit code (valid 10 "
        "minutes) to `customer_email`. `required: false` means no step is needed "
        "(no deposit, or the signed-in account already vouches for the email) and "
        "nothing was sent. Applies the organisation's Turnstile policy. Limited per "
        "visitor and to 5 codes per email per hour (429). Unknown, disabled and "
        "unentitled pages answer 404."
    ),
    operation_id="bookingsRequestEmailCode",
    responses={
        **BAD_REQUEST,
        **NOT_FOUND,
        429: {"description": "Too many codes requested or attempts made"},
        503: {"description": "Verification is temporarily unavailable"},
    },
)
@limiter.limit("5/minute;20/hour")
async def request_email_code(
    *,
    request: Request,
    session: SessionDep,
    slug: Annotated[str, Path(max_length=60)],
    payload: BookingEmailCodeRequest,
) -> Any:
    profile = await service.get_public_profile(session, slug)
    await require_turnstile(
        request,
        payload.turnstile_token,
        await public.turnstile_policy(session, profile),
    )
    payer = await optional_account(request, session, app="bookings")
    result = await public.request_email_code(session, profile, payload, payer=payer)
    await session.commit()
    return result


@router.post(
    "/public/{slug}/email-code/confirm",
    response_model=BookingEmailProof,
    summary="Exchange an emailed code for a deposit proof",
    description=(
        "Checks the code. A correct code is single use and returns a proof bound "
        "to the email, service and start time, valid 15 minutes, to send as "
        "`email_proof` when creating the booking. A wrong or expired code is 400; "
        "five wrong answers lock the email for 15 minutes (429)."
    ),
    operation_id="bookingsConfirmEmailCode",
    responses={
        **BAD_REQUEST,
        **NOT_FOUND,
        429: {"description": "Too many attempts; locked for a while"},
        503: {"description": "Verification is temporarily unavailable"},
    },
)
@limiter.limit("10/minute")
async def confirm_email_code(
    *,
    request: Request,
    session: SessionDep,
    slug: Annotated[str, Path(max_length=60)],
    payload: BookingEmailCodeConfirm,
) -> Any:
    _ = request
    profile = await service.get_public_profile(session, slug)
    return await public.confirm_email_code(profile, payload)


@router.get(
    "/public/bookings/{token}",
    response_model=BookingPublicDetail,
    summary="Get a booking by its manage token",
    description=(
        "A customer's own booking. Unknown, expired and unentitled tokens all "
        "answer 404."
    ),
    operation_id="bookingsGetPublicBooking",
    responses={**NOT_FOUND},
)
@limiter.limit("60/minute")
async def get_public_booking(
    *, request: Request, session: SessionDep, token: ManageToken
) -> Any:
    _ = request
    return await public.get_booking(session, token)


@router.post(
    "/public/bookings/{token}/cancel",
    response_model=BookingPublicDetail,
    summary="Cancel a booking",
    description=(
        "Cancels the booking and frees the slot. 409 inside the business's "
        "cancellation cutoff (`cancel_cutoff_hours`) or when the booking is "
        "already finished. Cancelling twice is harmless."
    ),
    operation_id="bookingsCancelPublicBooking",
    responses={**NOT_FOUND, **CONFLICT},
)
@limiter.limit("20/minute")
async def cancel_public_booking(
    *,
    request: Request,
    session: SessionDep,
    token: ManageToken,
    payload: BookingPublicCancel | None = None,
) -> Any:
    _ = request
    result = await public.cancel_booking(
        session, token, reason=payload.reason if payload else None
    )
    await session.commit()
    return result


@router.post(
    "/public/bookings/{token}/reschedule",
    response_model=BookingPublicDetail,
    summary="Move a booking to another slot",
    description=(
        "Moves the booking to another open slot with the same provider and "
        "service; the booking stays active and keeps its token. 409 when the "
        "slot is taken or the booking is inside the cancellation cutoff."
    ),
    operation_id="bookingsReschedulePublicBooking",
    responses={**NOT_FOUND, **CONFLICT},
)
@limiter.limit("20/minute")
async def reschedule_public_booking(
    *,
    request: Request,
    session: SessionDep,
    token: ManageToken,
    payload: BookingPublicReschedule,
) -> Any:
    _ = request
    result = await public.reschedule_booking(session, token, payload.starts_at)
    await session.commit()
    return result


@router.get(
    "/public/bookings/{token}/ics",
    response_class=Response,
    summary="Download a booking as a calendar file",
    description="The booking as an iCalendar (RFC 5545) event, UTC times.",
    operation_id="bookingsGetPublicBookingIcs",
    responses={
        200: {
            "description": "iCalendar file",
            "content": {"text/calendar": {"schema": {"type": "string"}}},
        },
        **NOT_FOUND,
    },
)
@limiter.limit("60/minute")
async def get_public_booking_ics(
    *, request: Request, session: SessionDep, token: ManageToken
) -> Response:
    _ = request
    text = await public.booking_ics(session, token)
    return Response(
        content=text,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'inline; filename="booking.ics"'},
    )
