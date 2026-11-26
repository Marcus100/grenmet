"""The case engine's notification catalogue (ADR-0069). Registered by the manifest.

Bodies carry the case reference, the action's title and its due date only.
"""

from src.notifications import events
from src.notifications.events import EventDef

ACTION_ASSIGNED = "cases.action_assigned"


def register() -> None:
    events.register(
        EventDef(
            key=ACTION_ASSIGNED,
            label="Corrective action assigned to you",
            description="You were made the owner of a corrective action.",
            audience="The owner of the corrective action",
            title="Action for {{ reference }}: {{ title }}",
            body="You own a corrective action for {{ reference }}, due {{ due }}: {{ title }}",
            variables=("reference", "title", "due"),
            email_mutable=False,
        )
    )
