"""Refund terms of an event and how much an order cancel gives back (pure rules).

An organiser sets, per event, whether tickets are refundable, how long before the
start a refund is still given (``refund_cutoff_hours``, NULL = the platform default)
and an optional cancellation fee (``fixed``: minor units per PAID ticket cancelled,
capped at what those tickets cost; ``percent``: a whole percent of the refundable
amount that is still left on the order).

``refund_due`` gives the amount to hand back for one order. An event that is
cancelled is always refunded in full, with no fee and whatever choice was sent: the
organiser cancelled, so the buyer is not at fault (Grenada Consumer Protection Act,
Schedule IV(f)). A cancel the organiser starts is refunded in full too, unless the
organiser explicitly keeps the money; only a buyer-initiated cancel applies the
policy, cutoff and fee. ``paid_terms_conflict`` says whether a change to the terms
is stricter than what buyers already agreed to once a paid order exists (loosening
is always allowed).

No database access here: the service passes the listing's values in.
"""

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Literal

from .config import events_settings

RefundPolicy = Literal["refundable", "no_refunds"]
FeeType = Literal["none", "fixed", "percent"]
Initiator = Literal["buyer", "organiser"]
REFUND_CHOICES = ("full", "none", "follow_policy")

#: Valid range for ``refund_cutoff_hours`` (30 days).
CUTOFF_HOURS_MAX = 720

#: Shown when a stricter change is refused once a paid order exists (409).
POLICY_STRICTER = (
    "Paid orders already exist for this event, so refunds can't be switched off. "
    "You can only make the refund policy more generous: set it to refundable."
)
CUTOFF_STRICTER = (
    "Paid orders already exist for this event, so the refund cutoff can only get "
    "shorter. It is {hours} hours now; a longer cutoff isn't allowed."
)
FEE_STRICTER = (
    "Paid orders already exist for this event, so the cancellation fee can't go up. "
    "It can only go down or stay the same, and a fixed and percent fee can't be "
    "swapped unless the fee becomes 0."
)


def effective_cutoff_hours(cutoff_hours: int | None) -> int:
    """The cutoff in force: the event's own, or the platform default when NULL."""
    if cutoff_hours is None:
        return events_settings.REFUND_CUTOFF_HOURS
    return cutoff_hours


def cancellation_fee_minor(
    *,
    fee_type: str,
    fee_value: int,
    refundable_minor: int,
    paid_ticket_count: int,
    paid_minor: int,
) -> int:
    """What the organiser keeps as a cancellation fee on one order.

    ``fixed`` is per PAID ticket cancelled (free tickets carry no fee), and the total
    is capped at what those paid tickets cost. ``percent`` is a whole percent of the
    refundable amount still left on the order, rounded half up."""
    if fee_type == "none":
        return 0
    if fee_type == "fixed":
        return min(fee_value * paid_ticket_count, paid_minor)
    if fee_type == "percent":
        return (refundable_minor * fee_value + 50) // 100
    raise ValueError(f"unknown cancellation fee type {fee_type!r}")


def refund_due(
    choice: str,
    *,
    policy: str,
    cutoff_hours: int | None,
    fee_type: str,
    fee_value: int,
    event_cancelled: bool,
    initiated_by: str,
    starts_at: datetime,
    now: datetime,
    refundable_minor: int,
    paid_ticket_count: int,
    paid_minor: int,
) -> int:
    """Minor units to refund for one order, from ``0`` to ``refundable_minor``.

    ``choice`` is ``full`` (everything), ``none`` (keep everything) or
    ``follow_policy``. Whatever the choice, an event that is cancelled is refunded in
    full with no fee. Under ``follow_policy``: an organiser-initiated cancel is
    refunded in full; a buyer-initiated one gets nothing under ``no_refunds`` or
    inside the cutoff, and otherwise the fee is taken off, floored at 0."""
    if choice not in REFUND_CHOICES:
        raise ValueError(f"unknown refund choice {choice!r}")
    if event_cancelled:
        return refundable_minor
    if choice == "full":
        return refundable_minor
    if choice == "none":
        return 0
    if initiated_by == "organiser":
        return refundable_minor
    if initiated_by != "buyer":
        raise ValueError(f"unknown initiator {initiated_by!r}")
    if policy == "no_refunds":
        return 0
    if starts_at - now < timedelta(hours=effective_cutoff_hours(cutoff_hours)):
        return 0
    fee = cancellation_fee_minor(
        fee_type=fee_type,
        fee_value=fee_value,
        refundable_minor=refundable_minor,
        paid_ticket_count=paid_ticket_count,
        paid_minor=paid_minor,
    )
    return max(0, refundable_minor - fee)


@dataclass(frozen=True)
class Terms:
    """The refund terms of a listing, as stored or as proposed."""

    policy: str
    cutoff_hours: int | None
    fee_type: str
    fee_value: int


def _fee_stricter(old: Terms, new: Terms) -> bool:
    if new.fee_type == "none" or new.fee_value == 0:
        return False  # no fee after the change: never stricter
    if old.fee_type == "none":
        return True  # any fee where there was none
    if old.fee_type == new.fee_type:
        return new.fee_value > old.fee_value
    return True  # a fixed fee swapped for a percent one, or back, is stricter


def paid_terms_conflict(old: Terms, new: Terms) -> str | None:
    """Why ``new`` is refused once a paid order exists, or ``None`` when allowed.

    Buyers must see the terms before they buy, so once someone has paid on the
    stored terms the organiser may only make them more generous. Moving from
    ``no_refunds`` to ``refundable`` is always more generous, whatever cutoff or fee
    comes with it, because nothing was refundable before. Otherwise the first
    stricter rule found is reported."""
    if old.policy == "no_refunds" and new.policy == "refundable":
        return None
    if old.policy == "refundable" and new.policy == "no_refunds":
        return POLICY_STRICTER
    old_cutoff = effective_cutoff_hours(old.cutoff_hours)
    if effective_cutoff_hours(new.cutoff_hours) > old_cutoff:
        return CUTOFF_STRICTER.format(hours=old_cutoff)
    if _fee_stricter(old, new):
        return FEE_STRICTER
    return None
