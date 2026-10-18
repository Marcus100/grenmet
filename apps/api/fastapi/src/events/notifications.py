"""Events' notification catalogue (F6). Registered at startup with the others.

Bodies carry public listing details only: a title, an organiser name and a time.
"""

from src.notifications import events
from src.notifications.events import EventDef

LISTING_PUBLISHED = "events.listing_published"
LISTING_CANCELLED = "events.listing_cancelled"
LISTING_POSTPONED = "events.listing_postponed"
ORGANISER_APPROVED = "events.organiser_approved"
TICKET_ISSUED = "events.ticket_issued"


def register() -> None:
    events.register(
        EventDef(
            key=LISTING_PUBLISHED,
            label="New event from an organiser you follow",
            description="An organiser you follow published an event.",
            audience="Members who follow the organiser",
            title="New event: {{ title }}",
            body="{{ organiser }} published {{ title }} on {{ starts }}.",
            variables=("title", "organiser", "starts"),
        )
    )
    events.register(
        EventDef(
            key=LISTING_CANCELLED,
            label="Event cancelled",
            description="An event you are going to or saved was cancelled.",
            audience="Members going to or saving the event",
            title="Cancelled: {{ title }}",
            body="{{ organiser }} cancelled {{ title }}, planned for {{ starts }}.",
            variables=("title", "organiser", "starts"),
            email_mutable=False,
        )
    )
    events.register(
        EventDef(
            key=LISTING_POSTPONED,
            label="Event rescheduled",
            description="An event you are going to or saved moved to a new time.",
            audience="Members going to or saving the event",
            title="New time: {{ title }}",
            body="{{ organiser }} moved {{ title }} to {{ starts }}.",
            variables=("title", "organiser", "starts"),
            email_mutable=False,
        )
    )
    events.register(
        EventDef(
            key=ORGANISER_APPROVED,
            label="Organiser verified",
            description="Barrels verified your organiser account.",
            audience="Owners and admins of the organiser",
            title="{{ organiser }} is verified",
            body="Barrels verified {{ organiser }}.",
            variables=("organiser",),
            email_mutable=False,
        )
    )
    events.register(
        EventDef(
            key=TICKET_ISSUED,
            label="Tickets issued",
            description="You claimed tickets for an event.",
            audience="The member who claimed the tickets",
            title="Your tickets: {{ title }}",
            body="You have {{ count }} ticket(s) for {{ title }} on {{ starts }}. Open My tickets to show the QR code at the door.",
            variables=("title", "count", "starts"),
            email_mutable=False,
        )
    )
