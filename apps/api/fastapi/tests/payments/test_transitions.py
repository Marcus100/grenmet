"""Payments lifecycles as declared tables: every (state, action) pair.

The expected values below are written out by hand, not read from
``src.payments.transitions``, so a change to the table shows up here as a failing
case and has to be made on purpose. No database: the guards are pure.
"""

import pytest

from src.payments import transitions
from src.payments.exceptions import PaymentsConflictError
from src.payments.models import (
    Attempt,
    AttemptStatus,
    Intent,
    IntentStatus,
    Refund,
    RefundStatus,
)

IS = IntentStatus
AS = AttemptStatus
RS = RefundStatus
IntentAction = transitions.IntentAction

INTENT_STATES = list(IntentStatus)
ATTEMPT_STATES = list(AttemptStatus)
REFUND_STATES = list(RefundStatus)

# intent action -> states it may start from, and the state it leaves the intent in.
EXPECTED_INTENT_FROM: dict[IntentAction, set[IntentStatus]] = {
    "checkout": {IS.REQUIRES_PAYMENT},
    "capture": {IS.REQUIRES_PAYMENT, IS.PROCESSING, IS.FAILED, IS.CANCELLED},
    "record_manual": {IS.REQUIRES_PAYMENT, IS.PROCESSING},
    "fail": {IS.REQUIRES_PAYMENT, IS.PROCESSING, IS.CANCELLED},
    "cancel": {IS.REQUIRES_PAYMENT, IS.PROCESSING},
}
EXPECTED_INTENT_TARGET: dict[IntentAction, IntentStatus] = {
    "checkout": IS.PROCESSING,
    "capture": IS.SUCCEEDED,
    "record_manual": IS.SUCCEEDED,
    "fail": IS.FAILED,
    "cancel": IS.CANCELLED,
}
INTENT_CASES = [
    (state, action) for state in INTENT_STATES for action in EXPECTED_INTENT_FROM
]

# attempt: state -> states it may move to.
EXPECTED_ATTEMPT_NEXT: dict[AttemptStatus, set[AttemptStatus]] = {
    AS.STARTED: {AS.SUCCEEDED, AS.FAILED},
    AS.SUCCEEDED: set(),
    AS.FAILED: set(),
}
ATTEMPT_CASES = [(state, target) for state in ATTEMPT_STATES for target in AS]

# refund: state -> states a provider report may move it to.
EXPECTED_REFUND_NEXT: dict[RefundStatus, set[RefundStatus]] = {
    RS.PENDING: {RS.SUCCEEDED, RS.FAILED},
    RS.FAILED: {RS.SUCCEEDED},
    RS.SUCCEEDED: set(),
}
REFUND_CASES = [(state, target) for state in REFUND_STATES for target in RS]

# Provider refund status -> our refund row status; anything else is ignored.
EXPECTED_PROVIDER_REFUND: dict[str, RefundStatus | None] = {
    "succeeded": RS.SUCCEEDED,
    "pending": RS.PENDING,
    "requires_action": RS.PENDING,
    "failed": RS.FAILED,
    "canceled": RS.FAILED,
    "processing": None,
    "": None,
}


def test_the_named_groups_are_the_declared_sets() -> None:
    assert transitions.UNPAID_STATES == {IS.REQUIRES_PAYMENT, IS.PROCESSING}
    assert transitions.UNPAID_ENDED_STATES == {IS.FAILED, IS.CANCELLED}
    assert transitions.ENDED_STATES == {IS.SUCCEEDED, IS.FAILED, IS.CANCELLED}
    assert transitions.LIVE_REFUND_STATES == {RS.PENDING, RS.SUCCEEDED}
    assert transitions.PROVIDER_LIVE_STATUSES == {
        "succeeded",
        "pending",
        "requires_action",
    }
    # Unpaid, unpaid-ended and succeeded cover every intent state exactly once.
    assert transitions.UNPAID_STATES | transitions.UNPAID_ENDED_STATES | {
        IS.SUCCEEDED
    } == set(INTENT_STATES)


def test_every_lifecycle_table_names_every_state_and_action() -> None:
    assert set(transitions.INTENT_TRANSITIONS) == set(EXPECTED_INTENT_FROM)
    assert set(transitions.ATTEMPT_NEXT) == set(ATTEMPT_STATES)
    assert set(transitions.REFUND_NEXT) == set(REFUND_STATES)


@pytest.mark.parametrize(("state", "action"), INTENT_CASES)
def test_intent_action_is_allowed_only_from_its_declared_states(
    state: IntentStatus, action: IntentAction
) -> None:
    allowed = state in EXPECTED_INTENT_FROM[action]
    assert transitions.can_intent(state, action) is allowed

    intent = Intent(status=state.value)
    if allowed:
        transitions.move_intent(intent, action)
        assert intent.status == EXPECTED_INTENT_TARGET[action].value
        return
    with pytest.raises(PaymentsConflictError) as refused:
        transitions.move_intent(intent, action, refusal="refused")
    assert refused.value.message == "refused"
    assert intent.status == state.value


@pytest.mark.parametrize(("state", "target"), ATTEMPT_CASES)
def test_attempt_settles_once_and_never_changes_after(
    state: AttemptStatus, target: AttemptStatus
) -> None:
    allowed = target in EXPECTED_ATTEMPT_NEXT[state]
    assert transitions.can_attempt(state, target) is allowed

    attempt = Attempt(status=state.value)
    if allowed:
        transitions.move_attempt(attempt, target)
        assert attempt.status == target.value
        return
    with pytest.raises(PaymentsConflictError):
        transitions.move_attempt(attempt, target)
    assert attempt.status == state.value


@pytest.mark.parametrize(("state", "target"), REFUND_CASES)
def test_refund_report_moves_only_as_the_table_allows(
    state: RefundStatus, target: RefundStatus
) -> None:
    allowed = target in EXPECTED_REFUND_NEXT[state]
    assert transitions.can_refund(state, target) is allowed

    # A backwards report is refused; a repeat of the state the row is in is not.
    repeat = state is target
    assert transitions.refund_refused(state, target) is (not repeat and not allowed)

    refund = Refund(status=state.value)
    if allowed:
        transitions.move_refund(refund, target)
        assert refund.status == target.value
        return
    with pytest.raises(PaymentsConflictError):
        transitions.move_refund(refund, target)
    assert refund.status == state.value


@pytest.mark.parametrize(
    ("provider_status", "expected"), list(EXPECTED_PROVIDER_REFUND.items())
)
def test_provider_refund_statuses_map_to_our_rows(
    provider_status: str, expected: RefundStatus | None
) -> None:
    assert transitions.PROVIDER_REFUND_STATE.get(provider_status) is expected
