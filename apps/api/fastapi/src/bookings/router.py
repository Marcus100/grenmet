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
from src.auth.email_verification import require_verified_email
from src.auth.models import User
from src.auth.policy import require_permission
from src.dependencies import (
    CurrentUser,
    OwnAccountAnyUser,
    SessionDep,
    TokenDep,
    optional_account,
)
from src.models import ApiError
from src.openapi_responses import (
    AUTHENTICATED,
    BAD_REQUEST,
    CONFLICT,
    NOT_FOUND,
    RateLimitedBody,
)
from src.organisations.api_key_auth import OrgAccess, org_or_key
from src.organisations.dependencies import (
    OrgContext,
    require_org_app,
    require_org_permission,
    resolve_org_caller,
)
from src.organisations.models import MembershipRole
from src.pagination import PaginationDep
from src.rate_limit import limiter
from src.turnstile import require_turnstile
from src.utils.datetime import utc_now

from . import (
    calendar_feed,
    deposit_payments,
    go_live,
    listing_review,
    public,
    service,
    signup,
    studio,
)
from .models import BookingBusinessType, BookingStatus
from .schemas import (
    BookingAgenda,
    BookingAgendaItem,
    BookingAvailability,
    BookingCalendarFeedLink,
    BookingCalendarFeedStatus,
    BookingClosureCreate,
    BookingClosureCreated,
    BookingClosurePublic,
    BookingDepositReceivedCreate,
    BookingEmailCodeConfirm,
    BookingEmailCodeRequest,
    BookingEmailCodeSent,
    BookingEmailProof,
    BookingExceptionCreate,
    BookingExceptionPublic,
    BookingListingQueue,
    BookingListingReview,
    BookingListingReviewList,
    BookingManualDepositCreate,
    BookingMyBooking,
    BookingMyBookingList,
    BookingMyChoice,
    BookingMyChoices,
    BookingMyOrganisation,
    BookingProfilePublic,
    BookingProfileUpdate,
    BookingProviderCreate,
    BookingProviderPublic,
    BookingProviderUpdate,
    BookingPublicBusinessPage,
    BookingPublicCancelBody,
    BookingPublicCreate,
    BookingPublicDetail,
    BookingPublicReceipt,
    BookingPublicReschedule,
    BookingServiceCreate,
    BookingServicePublic,
    BookingServiceUpdate,
    BookingSetupChecklist,
    BookingSignupCreate,
    BookingSignupReceipt,
    BookingSlot,
    BookingStarterTemplate,
    BookingStorefront,
    BookingStudioCancel,
    BookingStudioCreate,
    BookingStudioDecline,
    BookingStudioDetail,
    BookingStudioReschedule,
    BookingWorkingHoursUpdate,
    BookingWorkingPeriodPublic,
)
from .templates import STARTER_TEMPLATES

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
            id=o.id,
            name=o.name,
            slug=o.slug,
            role=MembershipRole(role),
            paused_at=paused_at,
        )
        for o, role, paused_at in rows
    ]


#: Answers 404 while business self sign-up is off (ADR-0066). It runs first, before the
#: caller is read, the body is checked or the rate limit counts.
SelfSignupOpen = Annotated[None, Depends(signup.require_self_signup_enabled)]


@router.post(
    "/me/organisations",
    response_model=BookingSignupReceipt,
    status_code=status.HTTP_201_CREATED,
    summary="Sign a business up to Barrels Bookings",
    description=(
        "A signed-in account with a verified email creates its own business: closed "
        "for online booking and unlisted until it is set up, on a 30-day trial, with "
        "the owner, a provider named after the owner with weekday hours and the "
        "chosen starter services. One self-created business per account. Requires an "
        "`Idempotency-Key` (the same key and body replays the first answer with "
        "`Idempotency-Replayed: true`). Turnstile is required outside local "
        "development whatever the global switch says. Answers 404 while self sign-up "
        "is switched off."
    ),
    operation_id="bookingsCreateMyOrganisation",
    responses={
        **BAD_REQUEST,
        **AUTHENTICATED,
        **NOT_FOUND,
        **CONFLICT,
        429: {
            "model": RateLimitedBody,
            "description": "Three sign-ups an hour per address",
        },
    },
)
@limiter.limit("3/hour")
async def create_my_organisation(
    *,
    _enabled: SelfSignupOpen,
    request: Request,
    response: Response,
    session: SessionDep,
    user: StudioCaller,
    payload: BookingSignupCreate,
    idempotency_key: idempotency.RequiredIdempotencyKey,
) -> Any:
    require_permission(current_user=user, permission_key=signup.BOOKINGS_ACCESS_KEY)
    require_verified_email(user, "create a business")
    organisation = await signup.prepare_organisation(
        session, user=user, key=idempotency_key, name=payload.name
    )

    async def create_once() -> tuple[int, dict[str, Any]]:
        # Turnstile tokens are single-use: the check runs only for a key the server has
        # not seen. A failed check is not stored and releases the key.
        await require_turnstile(
            request, payload.turnstile_token, signup.signup_turnstile_policy()
        )
        body = await signup.create_business(
            session, user=user, organisation=organisation, payload=payload
        )
        return status.HTTP_201_CREATED, body

    result = await idempotency.run_idempotent(
        session,
        scope=signup.SIGNUP_SCOPE,
        organisation_id=organisation.id,
        key=idempotency_key,
        request_body=payload.model_dump(mode="json", exclude={"turnstile_token"}),
        handler=create_once,
    )
    await session.commit()
    response.status_code = result.status_code
    if result.replayed:
        response.headers["Idempotency-Replayed"] = "true"
    return result.body


@router.get(
    "/me/business-templates",
    response_model=list[BookingStarterTemplate],
    summary="Starter templates for a new business",
    description=(
        "The fixed starter templates a sign-up can name: a short list of services with "
        "a suggested price in XCD minor units for each business type. Never a deposit "
        "or a policy. Needs a signed-in account."
    ),
    operation_id="bookingsListBusinessTemplates",
    responses=AUTHENTICATED,
)
async def list_business_templates(*, user: StudioCaller) -> Any:
    require_permission(current_user=user, permission_key=signup.BOOKINGS_ACCESS_KEY)
    return [signup.template_view(t) for t in STARTER_TEMPLATES.values()]


@router.get(
    "/me/businesses/{slug}/choices",
    response_model=BookingMyChoices,
    summary="What my earlier bookings suggest for my next one with a business",
    description=(
        "For a signed-in person about to book: up to three services they booked "
        "with this business before (the latest per service, with the provider "
        "used last) and a phone number to prefill. Built only from bookings "
        "whose business contact is linked to the caller's account (the same rule "
        "as My bookings, ADR-0058); nothing from other customers. Accepts an "
        "account token or the bookings app session. Unknown and disabled pages "
        "answer 404."
    ),
    operation_id="bookingsGetMyChoices",
    responses={
        **AUTHENTICATED,
        **NOT_FOUND,
        429: {"model": RateLimitedBody, "description": "Too many requests"},
    },
)
@limiter.limit("60/minute")
async def get_my_choices(
    *, request: Request, session: SessionDep, user: StudioCaller, slug: str
) -> Any:
    _ = request  # the rate limiter reads it
    phone, recent = await service.my_choices(session, user, slug)
    return BookingMyChoices(
        phone=phone,
        recent=[
            BookingMyChoice(
                service_id=service_id, provider_id=provider_id, last_booked_at=when
            )
            for service_id, provider_id, when in recent
        ],
    )


@router.get(
    "/me/bookings",
    response_model=BookingMyBookingList,
    summary="My bookings across businesses",
    description=(
        "The signed-in person's bookings with every business. `upcoming=true` lists "
        "soonest first; `upcoming=false` and no filter list newest first. A booking "
        "is listed when its business contact is linked to the account (a signed-in "
        "booking with a verified matching email, ADR-0058). Accepts a full account "
        "token or the account app's session; other apps' tokens get 401. Page with "
        "`page` and `size`."
    ),
    operation_id="bookingsListMyBookings",
    responses={
        **AUTHENTICATED,
        429: {"model": RateLimitedBody, "description": "Too many requests"},
    },
)
@limiter.limit("60/minute")
async def list_my_bookings(
    *,
    request: Request,
    session: SessionDep,
    current_user: OwnAccountAnyUser,
    pagination: PaginationDep,
    upcoming: Annotated[
        bool | None,
        Query(
            description=(
                "True: starting now or later, soonest first (starts_at, then id, "
                "ascending). False: earlier, newest first. Omit: all, newest first."
            )
        ),
    ] = None,
    cancelled: Annotated[
        bool | None,
        Query(
            description=(
                "True: only cancelled bookings. False: every booking except the "
                "cancelled ones. Omit: all statuses. Combine with `upcoming` for the "
                "Upcoming list (upcoming=true, cancelled=false)."
            )
        ),
    ] = None,
) -> Any:
    _ = request  # the rate limiter reads it
    moment = utc_now()
    rows, total = await service.list_my_bookings(
        session,
        current_user.id,
        upcoming=upcoming,
        cancelled=cancelled,
        pagination=pagination,
    )
    payments = await deposit_payments.payment_summaries(
        session, [booking for booking, *_ in rows]
    )
    return BookingMyBookingList(
        data=[
            BookingMyBooking(
                id=booking.id,
                status=BookingStatus(booking.status),
                starts_at=booking.starts_at,
                ends_at=booking.ends_at,
                service_name=service_name,
                business_name=business_name,
                business_slug=business_slug,
                payment=payments[booking.id],
                manage_url=public.my_manage_url(business_slug, booking, moment),
            )
            for booking, service_name, business_name, business_slug in rows
        ],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


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


# Recording a business-held deposit is an organisation-bound key (owners and admins
# hold it; a plain member needs a grant). Session only, no API key.
OrgDepositManager = Annotated[
    OrgContext,
    Depends(require_org_permission("bookings.deposits.manage", session_app="bookings")),
]
DEPOSIT_RECEIVED_ERRORS = {
    **WRITE_ERRORS,
    422: {"model": ApiError, "description": "The arrival time is in the future"},
}


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


@router.get(
    "/org/setup-checklist",
    response_model=BookingSetupChecklist,
    summary="Get my setup checklist",
    description=(
        "What the business still needs before it can open online booking (ADR-0066): "
        "`services` (an active service), `hours` (an active provider with working "
        "hours who offers an active service) and `contact` (a phone, WhatsApp, "
        "Instagram or email) are required; `branding` (a logo or colour) is optional. "
        "A business that signed itself up cannot set `enabled` until `missing` is "
        "empty: `PUT /org/profile` answers 409 `SETUP_INCOMPLETE` with `missing`."
    ),
    operation_id="bookingsGetSetupChecklist",
    responses=READ_ERRORS,
)
async def get_setup_checklist(*, session: SessionDep, org: BookingsOrgRead) -> Any:
    return await go_live.checklist(session, org.organisation_id)


@router.put(
    "/org/profile",
    response_model=BookingProfilePublic,
    summary="Create or update my booking profile",
    description=(
        "Set the public booking address, timezone, currency and booking rules. "
        "Online booking stays off until `enabled` is true; a business that signed "
        "itself up gets 409 `SETUP_INCOMPLETE` until its setup checklist is done. "
        "`brand_color` and "
        "`logo_file_id` set the accent and logo used in the business's emails."
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


# --- organisation: business closures (BK-20) -------------------------------------------


@router.get(
    "/org/closures",
    response_model=list[BookingClosurePublic],
    summary="List whole-business closures",
    description="Days the business is closed for every provider, earliest first.",
    operation_id="bookingsListClosures",
    responses=READ_ERRORS,
)
async def list_closures(
    *, session: SessionDep, org: BookingsOrgRead, pagination: PaginationDep
) -> Any:
    return await service.list_closures(
        session,
        org.organisation_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )


@router.post(
    "/org/closures",
    response_model=BookingClosureCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Close the business for whole days",
    description=(
        "Closes local days for every provider (both ends inclusive, at most a year). "
        "The response lists the active bookings inside the closure, first name only, "
        "for the studio to follow up. Existing bookings are not cancelled."
    ),
    operation_id="bookingsCreateClosure",
    responses=WRITE_ERRORS,
)
async def create_closure(
    *, session: SessionDep, org: BookingsOrgAdmin, payload: BookingClosureCreate
) -> Any:
    result = await service.create_closure(session, org.organisation_id, payload)
    await session.commit()
    return result


@router.delete(
    "/org/closures/{closure_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Reopen the business for a closure",
    description=(
        "Removes one closure. Deleting a closure already removed returns 204 again. "
        "Another business's closure answers 404."
    ),
    operation_id="bookingsDeleteClosure",
    responses=WRITE_ERRORS,
)
async def delete_closure(
    *, session: SessionDep, org: BookingsOrgAdmin, closure_id: uuid.UUID
) -> None:
    await service.delete_closure(
        session, closure_id, organisation_id=org.organisation_id
    )
    await session.commit()


# --- organisation: calendar feed (subscribed calendar, owners and admins) ----------------------


@router.get(
    "/org/calendar-feed",
    response_model=BookingCalendarFeedStatus,
    summary="Show my calendar feed status",
    description=(
        "Whether the business has a calendar feed, and when it was made or last rotated. "
        "The address is never shown again after it is created; rotate for a new one."
    ),
    operation_id="bookingsGetCalendarFeedStatus",
    responses=READ_ERRORS,
)
async def get_calendar_feed_status(
    *, session: SessionDep, org: BookingsOrgAdmin
) -> Any:
    row = await calendar_feed.get_feed(session, org.organisation_id)
    if row is None:
        return {"enabled": False}
    return {"enabled": True, "created_at": row.created_at, "rotated_at": row.rotated_at}


@router.post(
    "/org/calendar-feed",
    response_model=BookingCalendarFeedLink,
    status_code=status.HTTP_201_CREATED,
    summary="Create my calendar feed",
    description=(
        "Creates the business's private calendar feed and returns its https address once. "
        "Subscribing to it shows every booking (first names only) in Apple Calendar or "
        "Google Calendar. One feed per business: 409 if it exists, rotate it instead."
    ),
    operation_id="bookingsCreateCalendarFeed",
    responses=WRITE_ERRORS,
)
async def create_calendar_feed(*, session: SessionDep, org: BookingsOrgAdmin) -> Any:
    token, row = await calendar_feed.create_feed(session, org.organisation_id)
    payload = calendar_feed.link_payload(token, row)
    await session.commit()
    return payload


@router.post(
    "/org/calendar-feed/rotate",
    response_model=BookingCalendarFeedLink,
    summary="Rotate my calendar feed address",
    description=(
        "Replaces the feed's address and returns the new one once. The old address stops "
        "working at once; subscribers must add the new one."
    ),
    operation_id="bookingsRotateCalendarFeed",
    responses=WRITE_ERRORS,
)
async def rotate_calendar_feed(*, session: SessionDep, org: BookingsOrgAdmin) -> Any:
    token, row = await calendar_feed.rotate_feed(session, org.organisation_id)
    payload = calendar_feed.link_payload(token, row)
    await session.commit()
    return payload


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
    provider_id: Annotated[uuid.UUID | None, Query()] = None,
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
    "/org/bookings/{booking_id}/reschedule",
    response_model=BookingStudioDetail,
    summary="Move a booking to another time",
    description=(
        "Moves a `pending` or `confirmed` booking to a new start with the same "
        "provider and service, and emails the customer. Staff are not held to "
        "opening hours, lead time or the horizon, but the time must be in the "
        "future, on a whole minute and free (409 on a clash, 409 for any other "
        "status, 422 for a time in the past or with seconds). The same time "
        "again changes nothing."
    ),
    operation_id="bookingsRescheduleStudioBooking",
    responses=WRITE_ERRORS,
)
async def reschedule_studio_booking(
    *,
    session: SessionDep,
    org: BookingsOrgWrite,
    booking_id: BookingId,
    payload: BookingStudioReschedule,
) -> Any:
    result = await studio.reschedule(
        session,
        org.organisation_id,
        booking_id,
        payload.starts_at,
        actor_user_id=org.actor_id,
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
    "/org/bookings/{booking_id}/deposit-received",
    response_model=BookingStudioDetail,
    summary="Mark a deposit paid to the business as received",
    description=(
        "For a booking whose deposit the customer pays the business by hand "
        "(`deposit_to_business_minor` above 0). Records the method (cash, bank "
        "transfer, PayPal or other), an optional reference and when it arrived "
        "(default now, never in the future). No money moves through Barrels. Audited, "
        "with a staff-only history note that sends no calendar update. Sends no mail; "
        "later mails say the deposit was received. 409 with a `code` when the booking "
        "has no such deposit, is not pending or confirmed, or is already marked. "
        "Owners, admins and members granted `bookings.deposits.manage`; API keys are "
        "not accepted."
    ),
    operation_id="bookingsMarkDepositReceived",
    responses=DEPOSIT_RECEIVED_ERRORS,
)
async def mark_deposit_received(
    *,
    session: SessionDep,
    org: OrgDepositManager,
    booking_id: BookingId,
    payload: BookingDepositReceivedCreate,
) -> Any:
    result = await studio.mark_deposit_received(
        session, org.organisation_id, booking_id, payload, actor=org.user
    )
    await session.commit()
    return result


@router.delete(
    "/org/bookings/{booking_id}/deposit-received",
    response_model=BookingStudioDetail,
    summary="Undo a deposit marked as received",
    description=(
        "Takes back a deposit receipt recorded in error, so the booking shows the "
        "deposit as due again. Audited, with a staff-only history note. 409 with a "
        "`code` when the booking has no such deposit, is not pending or confirmed, or "
        "is not marked received. Owners, admins and members granted "
        "`bookings.deposits.manage`; API keys are not accepted."
    ),
    operation_id="bookingsUndoDepositReceived",
    responses=WRITE_ERRORS,
)
async def undo_deposit_received(
    *,
    session: SessionDep,
    org: OrgDepositManager,
    booking_id: BookingId,
) -> Any:
    result = await studio.undo_deposit_received(
        session, org.organisation_id, booking_id, actor=org.user
    )
    await session.commit()
    return result


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
    "/public/businesses",
    response_model=BookingPublicBusinessPage,
    summary="List businesses on the Barrels Bookings home page",
    description=(
        "Businesses that opted in to the home page and are open for booking, 24 to a "
        "page. `q` searches the name, category, description and city; `category` "
        "keeps one category; `type` keeps one business type (a fixed list, 422 for "
        "anything else). Each card has public fields only. `categories` lists the "
        "filter chips and `types_available` the business types on offer. Needs no "
        "sign-in."
    ),
    operation_id="bookingsListPublicBusinesses",
    responses={429: {"model": RateLimitedBody, "description": "Too many requests"}},
)
@limiter.limit("60/minute")
async def list_public_businesses(
    *,
    request: Request,
    session: SessionDep,
    q: Annotated[str | None, Query(max_length=80)] = None,
    category: Annotated[str | None, Query(max_length=80)] = None,
    business_type: Annotated[
        BookingBusinessType | None,
        Query(alias="type", description="Keep one business type."),
    ] = None,
    page: Annotated[int, Query(ge=1, le=1000)] = 1,
) -> Any:
    _ = request  # the rate limiter reads it
    return await service.list_public_businesses(
        session,
        q=q,
        category=category,
        page=page,
        business_type=business_type,
    )


@router.get(
    "/public/{slug}",
    response_model=BookingStorefront,
    summary="Get a business's booking page",
    description=(
        "Active services and providers for a public booking page. Unknown and "
        "disabled pages both answer 404. A paused business answers 200 with "
        "`accepting_bookings: false`, its contact details and nothing to book."
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
        "days), optionally for one provider and with `add_on_ids`, which make "
        "the slot longer. Times are UTC; `timezone` is the business's local zone "
        "for display. `due_at_booking_minor` is what booking this service with "
        "those add-ons charges now, so the storefront can show the real amount."
    ),
    operation_id="bookingsGetAvailability",
    responses={**BAD_REQUEST, **NOT_FOUND, **CONFLICT},
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
    provider_id: Annotated[uuid.UUID | None, Query()] = None,
    add_on_ids: Annotated[list[uuid.UUID] | None, Query(max_length=5)] = None,
) -> Any:
    _ = request
    profile = await service.get_public_profile(session, slug)
    service.require_taking_bookings(profile)
    slots = await service.available_slots(
        session,
        profile,
        service_id=service_id,
        provider_id=provider_id,
        first_day=first_day,
        last_day=last_day,
        add_on_ids=add_on_ids or [],
    )
    priced = await public.price_booking(
        session,
        profile,
        service_id=service_id,
        add_on_ids=add_on_ids or [],
    )
    return BookingAvailability(
        timezone=profile.timezone,
        service_id=service_id,
        due_at_booking_minor=priced.due_minor,
        email_code_required=priced.email_code_required,
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
        description=(
            "The manage token returned when the booking was made, or a signed "
            "manage link from a booking email."
        ),
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
            "model": ApiError,
            "description": (
                "A deposit is due and the email is not verified: no valid "
                "`email_proof` and no signed-in account vouching for it "
                "(`email_verification_required`)"
            ),
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
    service.require_taking_bookings(profile)
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
        **CONFLICT,
        429: {
            "model": RateLimitedBody,
            "description": "Too many codes requested or attempts made",
        },
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
    service.require_taking_bookings(profile)
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
        429: {
            "model": RateLimitedBody,
            "description": "Too many attempts; locked for a while",
        },
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


# The manage routes carry the booking's secret token in the path. slowapi keys a
# limit by the request path unless it has a scope, which would put the token in
# Redis and the in-memory fallback. Each route names a constant scope instead; a
# shared scope means every token shares one bucket per client address per route.
MANAGE_VIEW_SCOPE = "bookings-public-manage-view"
MANAGE_CANCEL_SCOPE = "bookings-public-manage-cancel"
MANAGE_RESCHEDULE_SCOPE = "bookings-public-manage-reschedule"
MANAGE_ICS_SCOPE = "bookings-public-manage-ics"


@router.get(
    "/public/bookings/{token}",
    response_model=BookingPublicDetail,
    summary="Get a booking by its manage token",
    description=(
        "A customer's own booking. Unknown, expired, tampered and unentitled tokens "
        "all answer 404."
    ),
    operation_id="bookingsGetPublicBooking",
    responses={**NOT_FOUND},
)
@limiter.limit("60/minute", scope=MANAGE_VIEW_SCOPE)
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
@limiter.limit("20/minute", scope=MANAGE_CANCEL_SCOPE)
async def cancel_public_booking(
    *,
    request: Request,
    session: SessionDep,
    token: ManageToken,
    payload: BookingPublicCancelBody = BookingPublicCancelBody(None),
) -> Any:
    _ = request
    result = await public.cancel_booking(
        session, token, reason=payload.root.reason if payload.root else None
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
@limiter.limit("20/minute", scope=MANAGE_RESCHEDULE_SCOPE)
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
@limiter.limit("60/minute", scope=MANAGE_ICS_SCOPE)
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


@router.get(
    "/public/calendar/{token}.ics",
    response_class=Response,
    summary="Subscribe to a business's bookings calendar",
    description=(
        "The business's private calendar feed (text/calendar): its bookings from a week "
        "ago to the booking horizon, first names only. Unknown, rotated, disabled and "
        "unentitled feeds answer one 404. Calendar apps poll it; the response may be "
        "cached privately for five minutes."
    ),
    operation_id="bookingsGetPublicCalendarFeed",
    responses={
        200: {
            "description": "iCalendar feed",
            "content": {"text/calendar": {"schema": {"type": "string"}}},
        },
        **NOT_FOUND,
        429: {"model": RateLimitedBody, "description": "Too many requests"},
    },
)
@limiter.limit("60/minute", scope=calendar_feed.RATE_LIMIT_SCOPE)
async def get_public_calendar_feed(
    *, request: Request, session: SessionDep, token: str
) -> Response:
    _ = request  # the rate limiter reads it
    text = await calendar_feed.feed_ics(session, token)
    return Response(
        content=text,
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "private, max-age=300"},
    )


# --- Barrels staff: listing review (ADR-0066) ----------------------------------------
# Admin zone: a Barrels staff account with ``bookings.listing.approve`` (superusers hold
# it). The permission is checked in ``listing_review``; these routes take no organisation.

_REVIEW_ERRORS = {**AUTHENTICATED, **NOT_FOUND, **CONFLICT}


@router.get(
    "/admin/listing-reviews",
    response_model=BookingListingReviewList,
    summary="List business listings for review (Barrels staff)",
    description=(
        "Businesses by review state, oldest business first. `queue=pending` (the "
        "default) lists businesses that asked for the home page listing and wait for "
        "approval; `approved` lists approved ones; `flagged` lists businesses whose "
        "owner left or whose sign-up name was refused for email; `all` lists every "
        "business. Page with `page` and `size`."
    ),
    operation_id="bookingsListListingReviews",
    responses=AUTHENTICATED,
)
async def list_listing_reviews(
    *,
    session: SessionDep,
    user: CurrentUser,
    pagination: PaginationDep,
    queue: Annotated[
        BookingListingQueue, Query(description="Which listings to show.")
    ] = BookingListingQueue.PENDING,
) -> Any:
    reviews, total = await listing_review.list_reviews(
        session, actor=user, queue=queue, pagination=pagination
    )
    return BookingListingReviewList(
        data=reviews, count=total, page=pagination.page, size=pagination.size
    )


@router.get(
    "/admin/businesses/{organisation_id}/listing",
    response_model=BookingListingReview,
    summary="Get a business's listing review (Barrels staff)",
    description=(
        "Whether the business asked for the home page listing, whether staff approved "
        "it, and the flags staff review (a self-created business, an owner who left)."
    ),
    operation_id="bookingsGetListingReview",
    responses=_REVIEW_ERRORS,
)
async def get_listing_review(
    *,
    session: SessionDep,
    user: CurrentUser,
    organisation_id: Annotated[str, Path(min_length=1, max_length=100)],
) -> Any:
    return await listing_review.get_review(
        session, actor=user, organisation_id=organisation_id
    )


@router.post(
    "/admin/businesses/{organisation_id}/listing/approve",
    response_model=BookingListingReview,
    summary="Approve a business's home page listing (Barrels staff)",
    description=(
        "Lets a listed business appear on the home page. Audited. 409 when it is "
        "already approved."
    ),
    operation_id="bookingsApproveListing",
    responses=_REVIEW_ERRORS,
)
async def approve_listing(
    *,
    session: SessionDep,
    user: CurrentUser,
    organisation_id: Annotated[str, Path(min_length=1, max_length=100)],
) -> Any:
    review = await listing_review.approve(
        session, actor=user, organisation_id=organisation_id
    )
    await session.commit()
    return review


@router.post(
    "/admin/businesses/{organisation_id}/listing/withdraw",
    response_model=BookingListingReview,
    summary="Withdraw a business's home page listing approval (Barrels staff)",
    description=(
        "Takes a business off the home page. Its booking page still works by its link. "
        "Audited. 409 when it is not approved."
    ),
    operation_id="bookingsWithdrawListing",
    responses=_REVIEW_ERRORS,
)
async def withdraw_listing(
    *,
    session: SessionDep,
    user: CurrentUser,
    organisation_id: Annotated[str, Path(min_length=1, max_length=100)],
) -> Any:
    review = await listing_review.withdraw(
        session, actor=user, organisation_id=organisation_id
    )
    await session.commit()
    return review
