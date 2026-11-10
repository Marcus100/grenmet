"""Requisition lifecycle as a declared table. No database access.

One requisition (``Requisition.status``), one move per action:

    submit           DRAFT -> SUBMITTED                  the requester sends it for decision
    cancel           DRAFT, SUBMITTED -> CANCELLED       the requester withdraws it
    approve          SUBMITTED -> APPROVED               an approver of the department decides
    reject           SUBMITTED -> REJECTED               an approver of the department declines
    deliver_partly   APPROVED, PARTIALLY_DELIVERED -> PARTIALLY_DELIVERED
    deliver_in_full  APPROVED, PARTIALLY_DELIVERED -> DELIVERED

Creating a requisition with ``submit`` set inserts it as SUBMITTED; an insert is not a
move. A draft's lines and purpose change while it is DRAFT (``EDITABLE``); that is a
content edit, not a status move, so it has no row in ``TRANSITIONS``.

Every write to ``Requisition.status`` made by ``service.py`` goes through
``move_requisition``, which checks ``TRANSITIONS`` first. The API's ``can_*`` flags are
derived from the same table through ``can_move``, so a flag and the write it offers
cannot disagree. The refusal messages stay with the callers.

Named groups: ``OPEN_FOR_DELIVERY`` is the set of requisitions that stores may still
deliver against. Its name and value are unchanged from before the table existed.
"""

from typing import Any, Literal, NamedTuple

from .exceptions import StoresStateError
from .models import RequisitionStatus

RequisitionMove = Literal[
    "submit", "cancel", "approve", "reject", "deliver_partly", "deliver_in_full"
]


class Transition(NamedTuple):
    allowed_from: frozenset[RequisitionStatus]
    target: RequisitionStatus


_D = RequisitionStatus.DRAFT
_S = RequisitionStatus.SUBMITTED
_A = RequisitionStatus.APPROVED
_R = RequisitionStatus.REJECTED
_P = RequisitionStatus.PARTIALLY_DELIVERED
_F = RequisitionStatus.DELIVERED
_C = RequisitionStatus.CANCELLED

TRANSITIONS: dict[RequisitionMove, Transition] = {
    "submit": Transition(frozenset({_D}), _S),
    "cancel": Transition(frozenset({_D, _S}), _C),
    "approve": Transition(frozenset({_S}), _A),
    "reject": Transition(frozenset({_S}), _R),
    "deliver_partly": Transition(frozenset({_A, _P}), _P),
    "deliver_in_full": Transition(frozenset({_A, _P}), _F),
}

#: Content (purpose, needed-by and lines) may change only while a draft.
EDITABLE: frozenset[RequisitionStatus] = frozenset({_D})
#: Stores may still deliver against these.
OPEN_FOR_DELIVERY: frozenset[RequisitionStatus] = TRANSITIONS[
    "deliver_partly"
].allowed_from


def can_move(state: RequisitionStatus, move: RequisitionMove) -> bool:
    return state in TRANSITIONS[move].allowed_from


def move_requisition(
    requisition: Any, move: RequisitionMove, *, refusal: str | None = None
) -> None:
    """Set ``requisition.status`` to the move's target. Raises a 409 when the table does
    not allow the move from the current status."""
    state = RequisitionStatus(requisition.status)
    if not can_move(state, move):
        raise StoresStateError(
            refusal or f"A requisition cannot {move} from status {state.value}"
        )
    requisition.status = TRANSITIONS[move].target
