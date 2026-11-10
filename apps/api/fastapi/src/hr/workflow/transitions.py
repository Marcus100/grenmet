"""Approval workflow lifecycle and the request status it mirrors. No database access.

Workflow instance (``WorkflowInstance.status``), one move per action:

    submit           DRAFT, RETURNED -> PENDING     an author sends the form for approval
    approve          PENDING -> APPROVED            the last required stage approves
    reject           PENDING -> REJECTED            a required stage rejects it
    return           PENDING -> RETURNED            a required stage sends it back with a reason
    cancel           PENDING -> CANCELLED           withdrawn before a decision
    cancel_approved  APPROVED -> CANCELLED          withdrawn after approval (leave, shift swap)

Moving to the next required stage changes nothing: the instance stays PENDING.

Request status (the form itself: leave, shift swap, absentee report, status report,
parking permit) follows the instance and never has a table of its own here. The
mapping ``REQUEST_STATUS_FOR`` says which request status each instance status implies.
APPROVED, REJECTED, RETURNED and CANCELLED are copied; DRAFT and PENDING leave the
request alone. ``mirror_request_status`` is the one workflow-side writer of the
request status, so the two cannot diverge. ``submit_request`` is the one author-side
writer: an editable form (DRAFT or RETURNED) becomes SUBMITTED when the author sends it
for approval. Every request-status write in the form services goes through one of the
two.

Every write to ``WorkflowInstance.status`` made by ``service.py`` goes through
``move_workflow``, which checks ``TRANSITIONS`` first. The refusal message is a
409 ``AppException``; the callers keep their own, more specific, checks first.
"""

from typing import Any, Literal, NamedTuple

from src.exceptions import AppException
from src.hr.models import EDITABLE_STATUSES, RequestStatus

from .models import WorkflowInstance, WorkflowStatus

WorkflowMove = Literal[
    "submit", "approve", "reject", "return", "cancel", "cancel_approved"
]


class Transition(NamedTuple):
    allowed_from: frozenset[WorkflowStatus]
    target: WorkflowStatus


_D = WorkflowStatus.DRAFT
_P = WorkflowStatus.PENDING
_A = WorkflowStatus.APPROVED
_R = WorkflowStatus.REJECTED
_T = WorkflowStatus.RETURNED
_C = WorkflowStatus.CANCELLED

TRANSITIONS: dict[WorkflowMove, Transition] = {
    "submit": Transition(frozenset({_D, _T}), _P),
    "approve": Transition(frozenset({_P}), _A),
    "reject": Transition(frozenset({_P}), _R),
    "return": Transition(frozenset({_P}), _T),
    "cancel": Transition(frozenset({_P}), _C),
    "cancel_approved": Transition(frozenset({_A}), _C),
}


#: Which request status each instance status implies. ``None``: the request keeps
#: its own status (the form is still in progress).
REQUEST_STATUS_FOR: dict[WorkflowStatus, RequestStatus | None] = {
    WorkflowStatus.DRAFT: None,
    WorkflowStatus.PENDING: None,
    WorkflowStatus.APPROVED: RequestStatus.APPROVED,
    WorkflowStatus.REJECTED: RequestStatus.REJECTED,
    WorkflowStatus.RETURNED: RequestStatus.RETURNED,
    WorkflowStatus.CANCELLED: RequestStatus.CANCELLED,
}


def can_move(state: WorkflowStatus, move: WorkflowMove) -> bool:
    return state in TRANSITIONS[move].allowed_from


def move_workflow(
    instance: WorkflowInstance, move: WorkflowMove, *, refusal: str | None = None
) -> None:
    """Set ``instance.status`` to the move's target. Raises a 409 when the table
    does not allow the move from the current status."""
    state = WorkflowStatus(instance.status)
    if not can_move(state, move):
        raise AppException(
            refusal or f"A workflow cannot {move} from status {state.value}", 409
        )
    instance.status = TRANSITIONS[move].target


def request_status_for(status: WorkflowStatus) -> RequestStatus | None:
    return REQUEST_STATUS_FOR[WorkflowStatus(status)]


def mirror_request_status(entity: Any, status: WorkflowStatus) -> None:
    """Copy the request status that ``status`` implies onto ``entity``. A status
    that implies none (DRAFT, PENDING) leaves the entity as it is."""
    target = request_status_for(status)
    if target is not None:
        entity.status = target


#: Request statuses an author may submit from (the form's own editable set).
SUBMIT_FROM: frozenset[RequestStatus] = EDITABLE_STATUSES


def submit_request(entity: Any, *, refusal: str | None = None) -> None:
    """Set a form's request status to SUBMITTED when the author sends it for approval.
    Raises a 409 unless the form is editable (DRAFT or RETURNED)."""
    state = RequestStatus(entity.status)
    if state not in SUBMIT_FROM:
        raise AppException(
            refusal or f"A request cannot be submitted from status {state.value}", 409
        )
    entity.status = RequestStatus.SUBMITTED
