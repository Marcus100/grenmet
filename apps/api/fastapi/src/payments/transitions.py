"""Payments lifecycles as declared tables. No database access.

Intent (one request to collect money). Each action moves ``Intent.status``:

    checkout        requires_payment -> processing          Stripe Checkout started
    capture         requires_payment, processing, failed, cancelled -> succeeded
                                                            the provider says the money was taken
    record_manual   requires_payment, processing -> succeeded
                                                            staff record cash, a transfer or a cheque
    fail            requires_payment, processing, cancelled -> failed
                                                            the provider says the payment failed
    cancel          requires_payment, processing -> cancelled
                                                            we withdraw an unpaid request

Attempt (one try at a checkout) is ``started`` until the provider answers, then
``succeeded`` or ``failed`` for good.

Refund (one refund row) moves only as the provider reports it:

    pending -> succeeded    (no money moves: it was already taken off the balance)
    pending -> failed       (the ledger entry is reversed)
    failed  -> succeeded    (the provider says the money went back: taken off again)
    succeeded -> (nothing)  (settled money is never moved back)

A report that asks for a move this table does not allow (a pending report after a
failure or a settlement, a failure after a settlement) is ignored: the caller logs
it at INFO with the event id, and the webhook still answers 2xx.

Every write to ``Intent.status``, ``Attempt.status`` and ``Refund.status`` after
creation goes through ``move_intent``, ``move_attempt`` or ``move_refund``, which
check this table first. A row's first status is set when the row is created, not by
a transition. The refusal messages stay with the callers, as they were before the
table existed. Named groups below replace the tuples the service used to repeat.
"""

from typing import Literal, NamedTuple

from .exceptions import PaymentsConflictError
from .models import Attempt, AttemptStatus, Intent, IntentStatus, Refund, RefundStatus

IntentAction = Literal["checkout", "capture", "record_manual", "fail", "cancel"]


class IntentTransition(NamedTuple):
    allowed_from: frozenset[IntentStatus]
    target: IntentStatus


_R = IntentStatus.REQUIRES_PAYMENT
_P = IntentStatus.PROCESSING
_S = IntentStatus.SUCCEEDED
_F = IntentStatus.FAILED
_C = IntentStatus.CANCELLED

INTENT_TRANSITIONS: dict[IntentAction, IntentTransition] = {
    "checkout": IntentTransition(frozenset({_R}), _P),
    # Provider capture is accepted from every state but succeeded: a payment made
    # after a failure or a cancellation is real money and is recorded.
    "capture": IntentTransition(frozenset({_R, _P, _F, _C}), _S),
    # Staff recording is refused once the request has failed or been cancelled.
    "record_manual": IntentTransition(frozenset({_R, _P}), _S),
    # A failure report after a cancellation is recorded (lateral, not backwards: no
    # money is involved). A failure after a success or a failure is ignored.
    "fail": IntentTransition(frozenset({_R, _P, _C}), _F),
    "cancel": IntentTransition(frozenset({_R, _P}), _C),
}

#: Not paid and not ended: it can still be paid or withdrawn.
UNPAID_STATES: frozenset[IntentStatus] = frozenset({_R, _P})
#: Ended without money: staff can no longer record a payment; a provider capture
#: still counts.
UNPAID_ENDED_STATES: frozenset[IntentStatus] = frozenset({_F, _C})
#: Ended: only a provider capture (money already taken) moves these on.
ENDED_STATES: frozenset[IntentStatus] = frozenset({_S, _F, _C})


def can_intent(state: IntentStatus, action: IntentAction) -> bool:
    return state in INTENT_TRANSITIONS[action].allowed_from


def move_intent(
    intent: Intent, action: IntentAction, *, refusal: str | None = None
) -> None:
    """Set ``intent.status`` to the action's target. Raises ``PaymentsConflictError``
    (409) with ``refusal`` when the table does not allow the action from the
    current status; the callers check ``can_intent`` first when a refusal would be
    a replay to ignore rather than a conflict."""
    state = IntentStatus(intent.status)
    if not can_intent(state, action):
        raise PaymentsConflictError(
            refusal or f"A payment cannot {action} from status {state.value}"
        )
    intent.status = INTENT_TRANSITIONS[action].target.value


#: The provider's answer settles a started attempt once.
ATTEMPT_NEXT: dict[AttemptStatus, frozenset[AttemptStatus]] = {
    AttemptStatus.STARTED: frozenset({AttemptStatus.SUCCEEDED, AttemptStatus.FAILED}),
    AttemptStatus.SUCCEEDED: frozenset(),
    AttemptStatus.FAILED: frozenset(),
}


def can_attempt(state: AttemptStatus, target: AttemptStatus) -> bool:
    return target in ATTEMPT_NEXT[state]


def move_attempt(attempt: Attempt, target: AttemptStatus) -> None:
    state = AttemptStatus(attempt.status)
    if not can_attempt(state, target):
        raise PaymentsConflictError(
            f"An attempt cannot move from {state.value} to {target.value}"
        )
    attempt.status = target.value


#: Refund rows: which provider reports may move a row from each state.
REFUND_NEXT: dict[RefundStatus, frozenset[RefundStatus]] = {
    RefundStatus.PENDING: frozenset({RefundStatus.SUCCEEDED, RefundStatus.FAILED}),
    RefundStatus.FAILED: frozenset({RefundStatus.SUCCEEDED}),
    RefundStatus.SUCCEEDED: frozenset(),
}

#: Refund rows that still count against what can be refunded (pending and settled).
LIVE_REFUND_STATES: frozenset[RefundStatus] = frozenset(
    {RefundStatus.PENDING, RefundStatus.SUCCEEDED}
)

#: What each provider refund status means for our row. Other statuses are ignored.
PROVIDER_REFUND_STATE: dict[str, RefundStatus] = {
    "succeeded": RefundStatus.SUCCEEDED,
    "pending": RefundStatus.PENDING,
    "requires_action": RefundStatus.PENDING,
    "failed": RefundStatus.FAILED,
    "canceled": RefundStatus.FAILED,
}
#: Provider refund statuses that hold money back from the payer.
PROVIDER_LIVE_STATUSES: frozenset[str] = frozenset(
    {"succeeded", "pending", "requires_action"}
)


def can_refund(current: RefundStatus, target: RefundStatus) -> bool:
    return target in REFUND_NEXT[current]


def refund_refused(current: RefundStatus, target: RefundStatus) -> bool:
    """True when a report asks for a backwards move. A report that names the state
    the row is already in is a replay, not a refusal."""
    return current is not target and not can_refund(current, target)


def move_refund(refund: Refund, target: RefundStatus) -> None:
    current = RefundStatus(refund.status)
    if not can_refund(current, target):
        raise PaymentsConflictError(
            f"A refund cannot move from {current.value} to {target.value}"
        )
    refund.status = target.value
