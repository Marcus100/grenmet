"""Barrels Events API: /api/v1/events/...

Public reads need no sign-in (an Events token personalises them). Member
writes need an Events app session (ADR-0016). Organiser and moderator routes
add ``events.organiser.manage`` / ``events.moderate``.
"""

import uuid
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Path, Query, Request, Response, status

from src.models import Message
from src.rate_limit import limiter

from . import schemas, service
from .dependencies import (
    EventsMember,
    EventsModerator,
    EventsOrganiser,
    EventsSession,
    EventsViewer,
)

router = APIRouter(prefix="/events", tags=["events"])

Slug = Annotated[str, Path(pattern=schemas.SLUG_PATTERN)]
Handle = Annotated[str, Path(pattern=schemas.HANDLE_PATTERN)]

_NOT_FOUND: dict[int | str, dict[str, Any]] = {404: {"description": "Not found"}}
_MEMBER: dict[int | str, dict[str, Any]] = {
    401: {"description": "Sign in to Barrels Events"},
    404: {"description": "Not found"},
    429: {"description": "Rate limit exceeded"},
}
_ORGANISER: dict[int | str, dict[str, Any]] = {
    **_MEMBER,
    403: {"description": "Organiser access required"},
    409: {"description": "Invalid listing"},
}
_MODERATOR: dict[int | str, dict[str, Any]] = {
    **_MEMBER,
    403: {"description": "Moderator access required"},
}


def _viewer_id(viewer: Any) -> uuid.UUID | None:
    return viewer.id if viewer is not None else None


# --- Public reads -------------------------------------------------------------------


@router.get(
    "/listings",
    response_model=schemas.ListingCardList,
    status_code=status.HTTP_200_OK,
    summary="List upcoming events",
    description="Published public events, soonest first, filtered by Grenada-calendar window, category, parish, price, tag or text.",
    responses={},
)
async def list_listings(
    *,
    session: EventsSession,
    viewer: EventsViewer,
    when: schemas.When | None = None,
    category: schemas.Category | None = None,
    parish: schemas.Parish | None = None,
    price: Literal["free", "paid"] | None = None,
    tag: Annotated[str | None, Query(max_length=30)] = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    organiser: Annotated[str | None, Query(pattern=schemas.SLUG_PATTERN)] = None,
    include_past: bool = False,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> schemas.ListingCardList:
    data, count = await service.list_listings(
        session,
        viewer_id=_viewer_id(viewer),
        when=when,
        category=category,
        parish=parish,
        price=price,
        tag=tag,
        query=q,
        organiser_slug=organiser,
        include_past=include_past,
        limit=limit,
        offset=offset,
    )
    return schemas.ListingCardList(data=data, count=count)


@router.get(
    "/listings/{slug}",
    response_model=schemas.ListingDetail,
    status_code=status.HTTP_200_OK,
    summary="Get an event",
    description="A published event with organiser, group and ticket tiers.",
    responses=_NOT_FOUND,
)
async def get_listing(
    *, session: EventsSession, viewer: EventsViewer, slug: Slug
) -> schemas.ListingDetail:
    return await service.get_listing(session, slug, _viewer_id(viewer))


@router.get(
    "/organisers/{slug}",
    response_model=schemas.OrganiserPublic,
    status_code=status.HTTP_200_OK,
    summary="Get an organiser",
    description="Public organiser profile with follower count.",
    responses=_NOT_FOUND,
)
async def get_organiser(
    *, session: EventsSession, viewer: EventsViewer, slug: Slug
) -> schemas.OrganiserPublic:
    return await service.get_organiser(session, slug, _viewer_id(viewer))


@router.get(
    "/groups",
    response_model=list[schemas.GroupSummary],
    status_code=status.HTTP_200_OK,
    summary="List groups",
    description="Every group with member counts and its next meetup.",
    responses={},
)
async def list_groups(
    *, session: EventsSession, viewer: EventsViewer
) -> list[schemas.GroupSummary]:
    return await service.list_groups(session, _viewer_id(viewer))


@router.get(
    "/groups/{slug}",
    response_model=schemas.GroupDetail,
    status_code=status.HTTP_200_OK,
    summary="Get a group",
    description="Group with members, announcements, upcoming meetups and (for members) its chat.",
    responses=_NOT_FOUND,
)
async def get_group(
    *, session: EventsSession, viewer: EventsViewer, slug: Slug
) -> schemas.GroupDetail:
    return await service.get_group(session, slug, _viewer_id(viewer))


@router.get(
    "/people/{handle}",
    response_model=schemas.ProfilePublic,
    status_code=status.HTTP_200_OK,
    summary="Get a member profile",
    description="Respects profile visibility and blocks; restricted profiles show only name and headline.",
    responses=_NOT_FOUND,
)
async def get_person(
    *, session: EventsSession, viewer: EventsViewer, handle: Handle
) -> schemas.ProfilePublic:
    return await service.get_person(session, handle, _viewer_id(viewer))


@router.post(
    "/suggestions",
    response_model=Message,
    status_code=status.HTTP_201_CREATED,
    summary="Suggest a missing event",
    description="Anyone may suggest an event; suggestions are reviewed before anything is published.",
    responses={429: {"description": "Rate limit exceeded"}},
)
@limiter.limit("5/minute")
async def create_suggestion(
    *,
    request: Request,
    session: EventsSession,
    viewer: EventsViewer,
    body: schemas.SuggestionCreate,
) -> Message:
    _ = request
    await service.create_suggestion(session, viewer, body)
    return Message(message="Thanks — we'll review it before it appears.")


# --- Member --------------------------------------------------------------------------


@router.get(
    "/me/profile",
    response_model=schemas.MyProfile,
    status_code=status.HTTP_200_OK,
    summary="Get my profile",
    description="The signed-in member's editable profile, created on first use.",
    responses=_MEMBER,
)
async def get_my_profile(
    *, session: EventsSession, user: EventsMember
) -> schemas.MyProfile:
    return service.my_profile(await service.get_or_create_profile(session, user))


@router.patch(
    "/me/profile",
    response_model=schemas.MyProfile,
    status_code=status.HTTP_200_OK,
    summary="Update my profile",
    description="Change handle, name, headline, bio, parish, interests, intents or visibility.",
    responses={**_MEMBER, 409: {"description": "Handle taken"}},
)
async def update_my_profile(
    *, session: EventsSession, user: EventsMember, body: schemas.ProfileUpdate
) -> schemas.MyProfile:
    return service.my_profile(await service.update_profile(session, user, body))


@router.get(
    "/me/plans",
    response_model=schemas.PlansPublic,
    status_code=status.HTTP_200_OK,
    summary="Get my plans",
    description="Upcoming events I'm going to or saved, my groups and organisers I follow.",
    responses=_MEMBER,
)
async def get_my_plans(
    *, session: EventsSession, user: EventsMember
) -> schemas.PlansPublic:
    return await service.plans(session, user)


@router.put(
    "/listings/{slug}/rsvp",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="RSVP to an event",
    description="Mark yourself as going. Idempotent.",
    responses=_MEMBER,
)
@limiter.limit("30/minute")
async def rsvp_listing(
    *, request: Request, session: EventsSession, user: EventsMember, slug: Slug
) -> Response:
    _ = request
    await service.set_rsvp(session, user, slug, going=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/listings/{slug}/rsvp",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Cancel an RSVP",
    description="Remove yourself from an event's going list. Idempotent.",
    responses=_MEMBER,
)
async def cancel_listing_rsvp(
    *, session: EventsSession, user: EventsMember, slug: Slug
) -> Response:
    await service.set_rsvp(session, user, slug, going=False)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/listings/{slug}/save",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Save an event",
    description="Bookmark an event. Idempotent.",
    responses=_MEMBER,
)
@limiter.limit("60/minute")
async def save_listing(
    *, request: Request, session: EventsSession, user: EventsMember, slug: Slug
) -> Response:
    _ = request
    await service.set_saved(session, user, slug, saved=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/listings/{slug}/save",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unsave an event",
    description="Remove a bookmark. Idempotent.",
    responses=_MEMBER,
)
async def unsave_listing(
    *, session: EventsSession, user: EventsMember, slug: Slug
) -> Response:
    await service.set_saved(session, user, slug, saved=False)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/organisers/{slug}/follow",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Follow an organiser",
    description="Follow to hear about new events. Idempotent.",
    responses=_MEMBER,
)
@limiter.limit("30/minute")
async def follow_organiser(
    *, request: Request, session: EventsSession, user: EventsMember, slug: Slug
) -> Response:
    _ = request
    await service.set_follow(session, user, slug, following=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/organisers/{slug}/follow",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unfollow an organiser",
    description="Stop following. Idempotent.",
    responses=_MEMBER,
)
async def unfollow_organiser(
    *, session: EventsSession, user: EventsMember, slug: Slug
) -> Response:
    await service.set_follow(session, user, slug, following=False)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/groups/{slug}/membership",
    response_model=Message,
    status_code=status.HTTP_200_OK,
    summary="Join a group",
    description="Join an open group, or request to join an approval group.",
    responses=_MEMBER,
)
@limiter.limit("30/minute")
async def join_group(
    *, request: Request, session: EventsSession, user: EventsMember, slug: Slug
) -> Message:
    _ = request
    result = await service.set_membership(session, user, slug, member=True)
    return Message(message="Request sent" if result == "pending" else "Joined")


@router.delete(
    "/groups/{slug}/membership",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Leave a group",
    description="Leave a group or withdraw a join request. Idempotent.",
    responses=_MEMBER,
)
async def leave_group(
    *, session: EventsSession, user: EventsMember, slug: Slug
) -> Response:
    await service.set_membership(session, user, slug, member=False)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get(
    "/me/network",
    response_model=schemas.NetworkPublic,
    status_code=status.HTTP_200_OK,
    summary="Get my network",
    description="Connections, pending requests both ways, and people you may know.",
    responses=_MEMBER,
)
async def get_my_network(
    *, session: EventsSession, user: EventsMember
) -> schemas.NetworkPublic:
    return await service.network(session, user)


@router.post(
    "/connections",
    response_model=Message,
    status_code=status.HTTP_200_OK,
    summary="Request a connection",
    description="Send a connection request; accepts theirs if they already asked you.",
    responses={**_MEMBER, 409: {"description": "Not allowed"}},
)
@limiter.limit("20/minute")
async def request_connection(
    *,
    request: Request,
    session: EventsSession,
    user: EventsMember,
    body: schemas.ConnectionCreate,
) -> Message:
    _ = request
    await service.request_connection(session, user, body.handle)
    return Message(message="Request sent")


@router.post(
    "/connections/{connection_id}/accept",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Accept a connection request",
    description="Accept a request addressed to you.",
    responses=_MEMBER,
)
async def accept_connection(
    *, session: EventsSession, user: EventsMember, connection_id: uuid.UUID
) -> Response:
    await service.accept_connection(session, user, connection_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/connections/{connection_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a connection",
    description="Remove a connection, cancel your request or decline theirs.",
    responses=_MEMBER,
)
async def remove_connection(
    *, session: EventsSession, user: EventsMember, connection_id: uuid.UUID
) -> Response:
    await service.remove_connection(session, user, connection_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put(
    "/blocks/{handle}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Block a member",
    description="Hide each of you from the other and end any connection. Idempotent.",
    responses={**_MEMBER, 409: {"description": "Not allowed"}},
)
async def block_member(
    *, session: EventsSession, user: EventsMember, handle: Handle
) -> Response:
    await service.set_block(session, user, handle, blocked=True)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/blocks/{handle}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Unblock a member",
    description="Remove a block. Idempotent.",
    responses=_MEMBER,
)
async def unblock_member(
    *, session: EventsSession, user: EventsMember, handle: Handle
) -> Response:
    await service.set_block(session, user, handle, blocked=False)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/reports",
    response_model=Message,
    status_code=status.HTTP_201_CREATED,
    summary="Report something",
    description="Report a profile, message, group or event to the moderators.",
    responses=_MEMBER,
)
@limiter.limit("10/minute")
async def create_report(
    *,
    request: Request,
    session: EventsSession,
    user: EventsMember,
    body: schemas.ReportCreate,
) -> Message:
    _ = request
    await service.create_report(session, user, body)
    return Message(message="Thanks. Our team will review your report.")


@router.get(
    "/threads",
    response_model=list[schemas.ThreadSummary],
    status_code=status.HTTP_200_OK,
    summary="List my conversations",
    description="Direct and group conversations, most recent first.",
    responses=_MEMBER,
)
async def list_threads(
    *, session: EventsSession, user: EventsMember
) -> list[schemas.ThreadSummary]:
    return await service.list_threads(session, user)


@router.post(
    "/threads",
    response_model=schemas.ThreadSummary,
    status_code=status.HTTP_200_OK,
    summary="Open a direct conversation",
    description="Open (or reuse) a direct thread. Allowed only between connections or members of a shared group.",
    responses={**_MEMBER, 403: {"description": "Messaging not allowed"}},
)
@limiter.limit("20/minute")
async def open_thread(
    *,
    request: Request,
    session: EventsSession,
    user: EventsMember,
    body: schemas.ThreadCreate,
) -> schemas.ThreadSummary:
    _ = request
    thread_id = await service.open_direct_thread(session, user, body.handle)
    detail = await service.get_thread(session, user, thread_id)
    return schemas.ThreadSummary(
        id=detail.id,
        kind=detail.kind,
        title=detail.title,
        group_slug=detail.group_slug,
        last_message=detail.messages[-1].body if detail.messages else None,
        last_sent_at=detail.messages[-1].sent_at if detail.messages else None,
    )


@router.get(
    "/threads/{thread_id}",
    response_model=schemas.ThreadDetail,
    status_code=status.HTTP_200_OK,
    summary="Get a conversation",
    description="Messages in a conversation you take part in; blocked members are hidden.",
    responses=_MEMBER,
)
async def get_thread(
    *, session: EventsSession, user: EventsMember, thread_id: uuid.UUID
) -> schemas.ThreadDetail:
    return await service.get_thread(session, user, thread_id)


@router.post(
    "/threads/{thread_id}/messages",
    response_model=schemas.MessagePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Send a message",
    description="Post to a conversation. The messaging rule is re-checked on every send.",
    responses={**_MEMBER, 403: {"description": "Messaging not allowed"}},
)
@limiter.limit("30/minute")
async def send_message(
    *,
    request: Request,
    session: EventsSession,
    user: EventsMember,
    thread_id: uuid.UUID,
    body: schemas.MessageCreate,
) -> schemas.MessagePublic:
    _ = request
    return await service.send_message(session, user, thread_id, body)


# --- Organiser -----------------------------------------------------------------------


@router.get(
    "/manage",
    response_model=schemas.ManagedOrganiser,
    status_code=status.HTTP_200_OK,
    summary="Get my organiser workspace",
    description="The organiser I belong to and all its listings, including drafts.",
    responses=_ORGANISER,
)
async def get_managed_organiser(
    *, session: EventsSession, user: EventsOrganiser
) -> schemas.ManagedOrganiser:
    return await service.managed_organiser(session, user)


@router.post(
    "/manage/listings",
    response_model=schemas.ManagedListing,
    status_code=status.HTTP_201_CREATED,
    summary="Create an event listing",
    description="Create a draft or published listing for my organiser, with ticket tiers.",
    responses=_ORGANISER,
)
async def create_managed_listing(
    *, session: EventsSession, user: EventsOrganiser, body: schemas.ListingUpsert
) -> schemas.ManagedListing:
    return await service.create_listing(session, user, body)


@router.put(
    "/manage/listings/{listing_id}",
    response_model=schemas.ManagedListing,
    status_code=status.HTTP_200_OK,
    summary="Update an event listing",
    description="Replace a listing's details and tiers.",
    responses=_ORGANISER,
)
async def update_managed_listing(
    *,
    session: EventsSession,
    user: EventsOrganiser,
    listing_id: uuid.UUID,
    body: schemas.ListingUpsert,
) -> schemas.ManagedListing:
    return await service.update_listing(session, user, listing_id, body)


# --- Moderation ----------------------------------------------------------------------


@router.get(
    "/moderation/reports",
    response_model=list[schemas.ReportPublic],
    status_code=status.HTTP_200_OK,
    summary="List open reports",
    description="Reports awaiting review.",
    responses=_MODERATOR,
)
async def list_reports(
    *, session: EventsSession, user: EventsModerator
) -> list[schemas.ReportPublic]:
    _ = user
    return [
        schemas.ReportPublic.model_validate(row, from_attributes=True)
        for row in await service.list_reports(session)
    ]


@router.patch(
    "/moderation/reports/{report_id}",
    response_model=schemas.ReportPublic,
    status_code=status.HTTP_200_OK,
    summary="Resolve a report",
    description="Mark a report actioned or dismissed.",
    responses=_MODERATOR,
)
async def update_report(
    *,
    session: EventsSession,
    user: EventsModerator,
    report_id: uuid.UUID,
    body: schemas.ReportUpdate,
) -> schemas.ReportPublic:
    _ = user
    row = await service.update_report(session, report_id, body)
    return schemas.ReportPublic.model_validate(row, from_attributes=True)


@router.get(
    "/moderation/suggestions",
    response_model=list[schemas.SuggestionPublic],
    status_code=status.HTTP_200_OK,
    summary="List pending suggestions",
    description="Resident event suggestions awaiting review.",
    responses=_MODERATOR,
)
async def list_suggestions(
    *, session: EventsSession, user: EventsModerator
) -> list[schemas.SuggestionPublic]:
    _ = user
    return [
        schemas.SuggestionPublic.model_validate(row, from_attributes=True)
        for row in await service.list_suggestions(session)
    ]


@router.patch(
    "/moderation/suggestions/{suggestion_id}",
    response_model=schemas.SuggestionPublic,
    status_code=status.HTTP_200_OK,
    summary="Review a suggestion",
    description="Approve or reject a resident suggestion.",
    responses=_MODERATOR,
)
async def update_suggestion(
    *,
    session: EventsSession,
    user: EventsModerator,
    suggestion_id: uuid.UUID,
    body: schemas.SuggestionUpdate,
) -> schemas.SuggestionPublic:
    _ = user
    row = await service.update_suggestion(session, suggestion_id, body)
    return schemas.SuggestionPublic.model_validate(row, from_attributes=True)
