"""Incidents' notification catalogue (ADR-0067). Registered by the manifest.

Bodies carry the reference, title and place only: never notes, persons or
contact details.
"""

from src.notifications import events
from src.notifications.events import EventDef

OPENED = "incidents.opened"
REOPENED = "incidents.reopened"


def register() -> None:
    events.register(
        EventDef(
            key=OPENED,
            label="Incident opened",
            description="An incident in a category you manage was opened.",
            audience="The manager of the incident's category",
            title="Incident {{ reference }}: {{ title }}",
            body="{{ reference }} was opened{{ place }}. {{ title }}",
            variables=("reference", "title", "place"),
            email_mutable=False,
            urgent=True,
        )
    )
    events.register(
        EventDef(
            key=REOPENED,
            label="Incident reopened",
            description="A closed incident in a category you manage was reopened.",
            audience="The manager of the incident's category",
            title="Reopened: {{ reference }}",
            body="{{ reference }} was reopened: {{ reason }}",
            variables=("reference", "reason"),
        )
    )
