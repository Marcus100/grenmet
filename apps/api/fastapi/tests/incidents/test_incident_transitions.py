"""The incident status table (src/incidents/transitions.py)."""

import uuid

import pytest

from src.incidents.exceptions import IncidentConflictError
from src.incidents.models import Incident, IncidentStatus
from src.incidents.transitions import INCIDENT_TRANSITIONS, move_incident

ACTOR = uuid.uuid4()


def _incident(status: IncidentStatus) -> Incident:
    return Incident(status=status.value, opened_at=None, closed_at=None)


def test_every_status_has_a_row() -> None:
    assert set(INCIDENT_TRANSITIONS) == {s.value for s in IncidentStatus}


@pytest.mark.parametrize(
    ("start", "target"),
    [
        (IncidentStatus.DRAFT, IncidentStatus.CLOSED),
        (IncidentStatus.OPEN, IncidentStatus.OPEN),
        (IncidentStatus.OPEN, IncidentStatus.DRAFT),
        (IncidentStatus.CLOSED, IncidentStatus.CLOSED),
        (IncidentStatus.CLOSED, IncidentStatus.DRAFT),
    ],
)
def test_refused_moves(start: IncidentStatus, target: IncidentStatus) -> None:
    with pytest.raises(IncidentConflictError):
        move_incident(_incident(start), target, actor_id=ACTOR)


def test_open_close_reopen_stamps_times() -> None:
    incident = _incident(IncidentStatus.DRAFT)
    move_incident(incident, IncidentStatus.OPEN, actor_id=ACTOR)
    first_opened = incident.opened_at
    assert first_opened is not None
    move_incident(incident, IncidentStatus.CLOSED, actor_id=ACTOR)
    assert (incident.status, incident.closed_by) == ("closed", ACTOR)
    assert incident.closed_at is not None
    move_incident(incident, IncidentStatus.OPEN, actor_id=ACTOR)
    assert incident.status == "open"
    assert incident.closed_at is None
    assert incident.closed_by is None
    assert incident.opened_at == first_opened
