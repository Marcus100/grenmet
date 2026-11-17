"""The moves of the two Printix status columns (ADR-0060). Every status write is here.

Event: ``open`` to ``closed``, one way. Ticket: ``valid`` to ``void`` and back, but
an admitted ticket cannot be voided. The admission and void races are settled by
their conditional UPDATEs in ``service.py``; these guards refuse the moves that
are never allowed, before any statement runs.
"""

from src.utils.datetime import utc_now

from .constants import PrintixEventStatus, PrintixTicketStatus
from .exceptions import PrintixConflict
from .models import PrintixEvent

EVENT_TRANSITIONS: dict[str, frozenset[str]] = {
    PrintixEventStatus.OPEN.value: frozenset({PrintixEventStatus.CLOSED.value}),
    PrintixEventStatus.CLOSED.value: frozenset(),
}

TICKET_TRANSITIONS: dict[str, frozenset[str]] = {
    PrintixTicketStatus.VALID.value: frozenset({PrintixTicketStatus.VOID.value}),
    PrintixTicketStatus.VOID.value: frozenset({PrintixTicketStatus.VALID.value}),
}


def move_event(event: PrintixEvent, target: PrintixEventStatus) -> None:
    """Close an event. Opening a closed one is refused; closing twice is a no-op.

    Closing records ``closed_at``, the cutoff for offline scans. There is no reopen
    move, so ``closed_at`` is never cleared; a reopen would have to clear it here.
    """
    current = event.status
    if current == target.value:
        return
    if target.value not in EVENT_TRANSITIONS.get(current, frozenset()):
        raise PrintixConflict("This event cannot move to that status")
    event.status = target.value
    event.closed_at = utc_now()


def check_ticket_move(
    current: str, target: PrintixTicketStatus, *, admitted: bool
) -> None:
    """Raise unless the ticket may move to ``target``. Admitted tickets cannot be voided."""
    if target.value not in TICKET_TRANSITIONS.get(current, frozenset()):
        raise PrintixConflict("This ticket cannot move to that status")
    if target is PrintixTicketStatus.VOID and admitted:
        raise PrintixConflict(
            "This ticket was already admitted, so it cannot be voided"
        )
