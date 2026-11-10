"""Weather product and tracked system lifecycles as declared tables. No database
access.

Authored product (one row per product id). The draft is always kept; the published
snapshot exists only while the product is published:

    draft     unpublished, published -> unchanged   saves a draft; a snapshot is kept
    publish   unpublished, published -> published   the new revision becomes the snapshot
    withdraw  published -> unpublished              the snapshot is removed; the draft is kept

Tracked system (``TropicalSystem.status``, ``active`` or ``closed``):

    link        active only      an outlook may link a system only while it is active
    merge into  not closed as a duplicate            a merge may not continue into a
                                                     system closed as a duplicate

The close and reopen edits are not a table: ``tropical_systems._closure`` takes the
target status from the request, and the reason rules stay with it. The refusal
messages stay with the callers, as they were before the table existed. Every stored
status is read through ``stored_system_state``, so an unknown value is a 409.

Published-state reads (``is_current`` expiry, issue times, SQL filters on the
``action`` column of revisions and entries) stay in their modules: they are queries
or side effects, not refusals.
"""

from typing import Literal, NamedTuple

from .exceptions import RevisionConflict, TropicalSystemConflict
from .models import AuthoredProduct

ProductState = Literal["unpublished", "published"]
ProductAction = Literal["draft", "publish", "withdraw"]

UNPUBLISHED: ProductState = "unpublished"
PUBLISHED: ProductState = "published"

PRODUCT_ACTIONS: tuple[ProductAction, ...] = ("draft", "publish", "withdraw")


class ProductTransition(NamedTuple):
    allowed_from: frozenset[ProductState]
    # None: the state is unchanged by the action.
    target: ProductState | None


PRODUCT_TRANSITIONS: dict[ProductAction, ProductTransition] = {
    "draft": ProductTransition(frozenset({UNPUBLISHED, PUBLISHED}), None),
    "publish": ProductTransition(frozenset({UNPUBLISHED, PUBLISHED}), PUBLISHED),
    "withdraw": ProductTransition(frozenset({PUBLISHED}), UNPUBLISHED),
}


def product_state(previous: AuthoredProduct | None) -> ProductState:
    """A product with no saved row, or no published snapshot, is unpublished."""
    return PUBLISHED if previous is not None and previous.published else UNPUBLISHED


def product_allowed(state: ProductState, action: ProductAction) -> bool:
    return state in PRODUCT_TRANSITIONS[action].allowed_from


def guard_product(state: ProductState, action: ProductAction, *, refusal: str) -> None:
    """Raise ``refusal`` as a 409 unless the product's state allows ``action``."""
    if not product_allowed(state, action):
        raise RevisionConflict(refusal)


def product_allowed_actions(state: ProductState) -> list[ProductAction]:
    """The actions the state allows, for the staff read (``allowed_actions``)."""
    return [action for action in PRODUCT_ACTIONS if product_allowed(state, action)]


ACTIVE: Literal["active"] = "active"
CLOSED: Literal["closed"] = "closed"
SystemStatus = Literal["active", "closed"]

_SYSTEM_STATUSES: dict[str, SystemStatus] = {ACTIVE: ACTIVE, CLOSED: CLOSED}

#: A tracked system an outlook may link: only an active one.
LINK_FROM: frozenset[SystemStatus] = frozenset({ACTIVE})


def stored_system_state(stored: str) -> SystemStatus:
    """The status a stored tracked system names. An unknown value is a 409 conflict,
    not a 500 and not a silent "active": the row needs a person to look at it."""
    try:
        return _SYSTEM_STATUSES[stored]
    except KeyError:
        raise TropicalSystemConflict(
            "The stored tracked system status is not recognised. Reload it, or ask for a review."
        ) from None


def can_link(state: SystemStatus) -> bool:
    return state in LINK_FROM


def can_merge_into(state: SystemStatus, closed_reason: str | None) -> bool:
    """A merge may not continue into a system closed as a duplicate."""
    return not (state == CLOSED and closed_reason == "duplicate")
