"""Invoice lifecycle as a declared table. No database access.

One invoice (``Invoice.status``), one move per action:

    issue      DRAFT -> ISSUED                       numbered and sent; sets ``issued_at``
    void       ISSUED -> VOID                        only with no payments; sets ``voided_at``
    part_pay   ISSUED, PARTIALLY_PAID -> PARTIALLY_PAID   a payment leaves a balance
    settle     ISSUED, PARTIALLY_PAID -> PAID             a payment clears the balance

Drafts are edited and deleted in ``invoices.py`` under their own DRAFT checks; those do
not change the status, so they have no move here.

Every write to ``Invoice.status`` made by ``invoices.py`` goes through ``move_invoice``,
which checks ``TRANSITIONS`` first. The callers keep their own, more specific checks and
messages before they reach the write.

``OPEN_STATUSES`` is the named group of invoices that still await money: issued or
partly paid. Reminders, receivables and payment recording all use it.
"""

from datetime import datetime
from typing import Any, Literal, NamedTuple

from .exceptions import InvoiceStateError
from .models import InvoiceStatus

InvoiceMove = Literal["issue", "void", "part_pay", "settle"]

#: Stored values of the invoices still awaiting money (issued or partly paid).
OPEN_STATUSES: tuple[str, ...] = (
    InvoiceStatus.ISSUED.value,
    InvoiceStatus.PARTIALLY_PAID.value,
)


class InvoiceTransition(NamedTuple):
    allowed_from: frozenset[InvoiceStatus]
    target: InvoiceStatus
    #: The timestamp column this move sets from ``at``, if any.
    stamp: str | None = None


_D = InvoiceStatus.DRAFT
_I = InvoiceStatus.ISSUED
_PP = InvoiceStatus.PARTIALLY_PAID
_PD = InvoiceStatus.PAID
_V = InvoiceStatus.VOID

TRANSITIONS: dict[InvoiceMove, InvoiceTransition] = {
    "issue": InvoiceTransition(frozenset({_D}), _I, "issued_at"),
    "void": InvoiceTransition(frozenset({_I}), _V, "voided_at"),
    "part_pay": InvoiceTransition(frozenset({_I, _PP}), _PP),
    "settle": InvoiceTransition(frozenset({_I, _PP}), _PD),
}


def can_move(state: InvoiceStatus, move: InvoiceMove) -> bool:
    return state in TRANSITIONS[move].allowed_from


def move_invoice(
    invoice: Any,
    move: InvoiceMove,
    *,
    at: datetime | None = None,
    refusal: str | None = None,
) -> None:
    """Set ``invoice.status`` to the move's target and, for issue and void, the matching
    timestamp to ``at``. Raises ``InvoiceStateError`` (409) when the table does not
    allow the move, or when the stored value is not a declared status."""
    try:
        state = InvoiceStatus(invoice.status)
    except ValueError:
        raise InvoiceStateError(
            f"This invoice has an unknown status '{invoice.status}'"
        ) from None
    if not can_move(state, move):
        raise InvoiceStateError(
            refusal or f"An invoice cannot {move} from status {state.value}"
        )
    row = TRANSITIONS[move]
    invoice.status = row.target.value
    if row.stamp is not None:
        if at is None:
            raise ValueError(f"The {move} move needs its timestamp")
        setattr(invoice, row.stamp, at)
