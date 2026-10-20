"""Catalogue of events organisations can subscribe to (names and data schemas).

Domains call ``service.emit_event`` with one of these keys. The ``data`` object is
validated against the event's schema, so a receiver can rely on its shape. Keep
payloads to identifiers, status and amounts: no names, emails or phone numbers.
Adding an event is additive; removing or renaming one is a breaking change.
"""

from dataclasses import dataclass
from typing import Any

from pydantic import ConfigDict

from src.models import BaseModel

WILDCARD = "*"
PING = "ping"


class _EventData(BaseModel):
    model_config = ConfigDict(extra="forbid")


class BookingEventData(_EventData):
    booking_id: str
    status: str
    service_id: str | None = None
    provider_id: str | None = None
    starts_at: str | None = None
    ends_at: str | None = None


class BookingRescheduledData(BookingEventData):
    previous_starts_at: str | None = None
    previous_ends_at: str | None = None


class PaymentEventData(_EventData):
    payment_id: str
    amount_minor: int
    currency: str
    source_type: str | None = None
    source_id: str | None = None


class PaymentRefundedData(PaymentEventData):
    refund_id: str
    refunded_amount_minor: int


class ContactErasedData(_EventData):
    contact_id: str
    erased_at: str | None = None


class PingData(_EventData):
    message: str = "Barrels webhook test"


@dataclass(frozen=True)
class EventType:
    key: str
    description: str
    schema: type[BaseModel]


CATALOGUE: dict[str, EventType] = {
    event.key: event
    for event in (
        EventType("booking.created", "A booking was made.", BookingEventData),
        EventType("booking.cancelled", "A booking was cancelled.", BookingEventData),
        EventType(
            "booking.rescheduled",
            "A booking moved to a new time.",
            BookingRescheduledData,
        ),
        EventType("payment.succeeded", "A payment succeeded.", PaymentEventData),
        EventType("payment.refunded", "A payment was refunded.", PaymentRefundedData),
        EventType(
            "contact.erased", "A contact was erased on request.", ContactErasedData
        ),
    )
}
#: Only for the synchronous test delivery; never subscribable or fanned out.
PING_EVENT = EventType(PING, "A test event sent on request.", PingData)


def is_known(key: str) -> bool:
    return key in CATALOGUE


def validate_subscription(event_types: list[str]) -> list[str]:
    """Raise ``ValueError`` for unknown keys; return the sorted unique list. ``*``
    stands alone because it already covers everything."""
    unique = sorted(set(event_types))
    unknown = [key for key in unique if key != WILDCARD and key not in CATALOGUE]
    if unknown:
        raise ValueError(f"Unknown event types: {', '.join(unknown)}")
    if WILDCARD in unique:
        return [WILDCARD]
    return unique


def validated_data(event_type: str, data: dict[str, Any]) -> dict[str, Any]:
    event = PING_EVENT if event_type == PING else CATALOGUE[event_type]
    return event.schema.model_validate(data).model_dump(mode="json")
