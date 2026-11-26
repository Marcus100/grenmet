"""Incident change history, grouped under the organisation's history subject.

Readable by that organisation's admins and owners, who hold every incidents key,
and by platform superusers (``src/organisations/audit.py``, the platform's support
access; private note text is visible there although the incidents routes refuse
them). Status, lock and reopening changes are what a review needs on record, so
nothing is excluded.
"""

from src.audit import registry

from .models import (
    Incident,
    IncidentCategory,
    IncidentCheck,
    IncidentChecklistItem,
    IncidentNote,
    IncidentTimelineEntry,
)

SUBJECT = "platform_organisation"


def register() -> None:
    for model, record_type, label in (
        (IncidentCategory, "incident_category", "Incident category"),
        (IncidentChecklistItem, "incident_checklist_item", "Incident checklist item"),
        (Incident, "incident", "Incident"),
        (IncidentCheck, "incident_check", "Incident checklist line"),
        (IncidentTimelineEntry, "incident_timeline_entry", "Incident timeline entry"),
        (IncidentNote, "incident_note", "Incident note"),
    ):
        registry.track(
            model,
            record_type=record_type,
            entity_type=SUBJECT,
            entity_id_attr="organisation_id",
            label=label,
        )
