"""Catalogue of qualifying source types (ADR-0030, PF8).

A programme's ``qualifying_source_type`` must be one of these. Every source is a
completed real-world action in another Barrels product; none is attention
(opening the app, scrolling, logging in) and none can be bought. Adding a source
means adding a row here and having that product call
``service.record_qualifying_action`` (directly, or from an outbox handler).
"""

from dataclasses import dataclass

EVENTS_ADMISSION = "events.admission"
BOOKINGS_COMPLETED = "bookings.completed"
BILLING_INVOICE_PAID = "billing.invoice_paid"
PAYMENTS_SUCCEEDED = "payments.succeeded"
VENUE_CHECK_IN = "rewards.venue_check_in"


@dataclass(frozen=True)
class QualifyingSource:
    key: str
    label: str
    description: str


QUALIFYING_SOURCES: dict[str, QualifyingSource] = {
    source.key: source
    for source in (
        QualifyingSource(
            EVENTS_ADMISSION, "Event admission", "A ticket scanned at the door."
        ),
        QualifyingSource(
            BOOKINGS_COMPLETED, "Completed booking", "An appointment that took place."
        ),
        QualifyingSource(
            BILLING_INVOICE_PAID, "Paid invoice", "An invoice settled in full."
        ),
        QualifyingSource(
            PAYMENTS_SUCCEEDED, "Successful payment", "A payment that succeeded."
        ),
        QualifyingSource(
            VENUE_CHECK_IN,
            "Venue check-in",
            "A visit proven by scanning the venue's rotating QR code.",
        ),
    )
}


def is_qualifying_source(source_type: str) -> bool:
    return source_type in QUALIFYING_SOURCES
