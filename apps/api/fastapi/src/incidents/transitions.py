"""The moves of an incident's status (ADR-0067). Every status write is here.

Draft to open (the response starts), open to closed (the record locks), closed
back to open (a manager's reopening, with a reason on the timeline). Nothing goes
back to draft, and a draft cannot close. The row lock taken in ``service.py``
settles concurrent moves; this guard refuses the moves that are never allowed.
"""

import uuid

from src.utils.datetime import utc_now

from .exceptions import IncidentConflictError
from .models import Incident, IncidentStatus

INCIDENT_TRANSITIONS: dict[str, frozenset[str]] = {
    IncidentStatus.DRAFT.value: frozenset({IncidentStatus.OPEN.value}),
    IncidentStatus.OPEN.value: frozenset({IncidentStatus.CLOSED.value}),
    IncidentStatus.CLOSED.value: frozenset({IncidentStatus.OPEN.value}),
}

_REFUSALS: dict[IncidentStatus, str] = {
    IncidentStatus.OPEN: "Only a draft can be opened, or a closed incident reopened",
    IncidentStatus.CLOSED: "Only an open incident can be closed",
    IncidentStatus.DRAFT: "An incident never goes back to draft",
}


def move_incident(
    incident: Incident, target: IncidentStatus, *, actor_id: uuid.UUID
) -> None:
    """Move ``incident`` to ``target`` and stamp the times the move implies.

    Opening a draft sets ``opened_at``; closing sets ``closed_at`` and
    ``closed_by``; reopening clears both and keeps the first ``opened_at``."""
    if target.value not in INCIDENT_TRANSITIONS.get(incident.status, frozenset()):
        raise IncidentConflictError(_REFUSALS[target])
    now = utc_now()
    if target is IncidentStatus.OPEN:
        if incident.opened_at is None:
            incident.opened_at = now
        incident.closed_at = None
        incident.closed_by = None
    elif target is IncidentStatus.CLOSED:
        incident.closed_at = now
        incident.closed_by = actor_id
    incident.status = target.value
