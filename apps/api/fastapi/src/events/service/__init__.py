"""Barrels Events business rules.

Filtering, joins and counts happen in SQL; Pydantic shapes the result at the
edge. Safety rules live here so every client gets them:

- direct messages only between accepted connections or members of a shared
  group (``can_message``);
- a block hides each person from the other: profiles, going lists, people
  suggestions and messaging;
- ``visibility="connections"`` profiles show only name and headline to people
  outside the member's network."""

from .admission import admit_ticket, manifest
from .cancellation import cancel_event, postpone_event, refund_ticket
from .common import FRIDAY, GOING_PREVIEW, GRENADA, SUNDAY, UTC_TZ, when_window
from .discover import (
    get_group,
    get_listing,
    get_organiser,
    list_groups,
    list_listings,
    set_follow,
    set_membership,
    set_rsvp,
    set_saved,
)
from .messaging import get_thread, list_threads, open_direct_thread, send_message
from .moderation import (
    create_suggestion,
    list_reports,
    list_suggestions,
    update_report,
    update_suggestion,
)
from .network import (
    accept_connection,
    create_report,
    get_person,
    network,
    plans,
    remove_connection,
    request_connection,
    set_block,
)
from .organiser_admin import (
    create_listing,
    create_organiser,
    listing_activity,
    managed_organiser,
    organiser_public,
    pending_organisers,
    request_organiser,
    review_organiser,
    set_organiser_logo,
    update_listing,
)
from .outlet import (
    close_till,
    get_sale,
    open_till,
    sell_tickets,
)
from .outlet import (
    overview as outlet_overview,
)
from .people import (
    blocked_ids,
    can_message,
    connection_state,
    get_or_create_profile,
    my_profile,
    update_profile,
)
from .settlement import organiser_settlement, settlement, settlement_csv
from .ticketing import cancel_ticket, claim_tickets, my_order, my_ticket, my_tickets

__all__ = [
    "FRIDAY",
    "GOING_PREVIEW",
    "GRENADA",
    "SUNDAY",
    "UTC_TZ",
    "accept_connection",
    "admit_ticket",
    "cancel_event",
    "postpone_event",
    "refund_ticket",
    "organiser_settlement",
    "settlement",
    "settlement_csv",
    "close_till",
    "get_sale",
    "open_till",
    "outlet_overview",
    "sell_tickets",
    "manifest",
    "blocked_ids",
    "can_message",
    "cancel_ticket",
    "claim_tickets",
    "my_order",
    "my_ticket",
    "my_tickets",
    "connection_state",
    "create_listing",
    "create_report",
    "create_suggestion",
    "get_group",
    "get_listing",
    "get_or_create_profile",
    "get_organiser",
    "get_person",
    "get_thread",
    "list_groups",
    "list_listings",
    "list_reports",
    "list_suggestions",
    "list_threads",
    "create_organiser",
    "pending_organisers",
    "request_organiser",
    "review_organiser",
    "set_organiser_logo",
    "listing_activity",
    "managed_organiser",
    "organiser_public",
    "my_profile",
    "network",
    "open_direct_thread",
    "plans",
    "remove_connection",
    "request_connection",
    "send_message",
    "set_block",
    "set_follow",
    "set_membership",
    "set_rsvp",
    "set_saved",
    "update_listing",
    "update_profile",
    "update_report",
    "update_suggestion",
    "when_window",
]
