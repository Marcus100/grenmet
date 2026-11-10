"""CAP alert lifecycle as a declared state machine. No database access.

    DRAFT -> SUBMITTED -> APPROVED -> PUBLISHED -> EXPIRED | CANCELLED

Every write to ``CapAlert.lifecycle_state`` is one of the actions in
``TRANSITIONS`` and goes through ``service._set_lifecycle``, which checks this
table before it assigns. The refusal messages stay with the callers, as they
were before the table existed.

Two writes are not transitions: a new alert starts as DRAFT (the column
default), and a cancellation message is created already PUBLISHED
(``CANCELLATION_STATE``), because it goes out at once.
"""

from typing import Literal, NamedTuple

from .models import CapLifecycleState

CapAction = Literal[
    "submit",
    "approve",
    "revert_to_draft",
    "publish",
    "emergency_publish",
    "cancel",
    "supersede",
    "expire",
]


class Transition(NamedTuple):
    allowed_from: frozenset[CapLifecycleState]
    target: CapLifecycleState


_D = CapLifecycleState.DRAFT
_S = CapLifecycleState.SUBMITTED
_A = CapLifecycleState.APPROVED
_P = CapLifecycleState.PUBLISHED
_E = CapLifecycleState.EXPIRED
_C = CapLifecycleState.CANCELLED

TRANSITIONS: dict[CapAction, Transition] = {
    # Author sends the draft for review (needs the cap.alert.submit permission).
    "submit": Transition(frozenset({_D}), _S),
    # A reviewer, or the author when policy allows, approves a submitted alert.
    "approve": Transition(frozenset({_S}), _A),
    # Editing a submitted or approved alert resets it, so approval covers only
    # the content that was approved.
    "revert_to_draft": Transition(frozenset({_S, _A}), _D),
    # Normal publish: approved alerts only.
    "publish": Transition(frozenset({_A}), _P),
    # Duty-supervisor publish without approval (ADR-0023 audited path).
    "emergency_publish": Transition(frozenset({_D, _S, _A}), _P),
    # Cancel: withdraws a published alert with a cancellation message.
    "cancel": Transition(frozenset({_P}), _C),
    # A published Update or Cancel retires the message it references.
    "supersede": Transition(frozenset({_P}), _E),
    # Natural or manual expiry of a published alert.
    "expire": Transition(frozenset({_P}), _E),
}

# Actions a person can request on an alert (what the desk offers). The other
# two happen as side effects: an edit reverts to draft, and publishing a newer
# message supersedes the one it references.
OFFERED_ACTIONS: tuple[CapAction, ...] = (
    "submit",
    "approve",
    "publish",
    "emergency_publish",
    "cancel",
    "expire",
)

# A cancellation message is born published (see module docstring).
CANCELLATION_STATE = CapLifecycleState.PUBLISHED

# Named state groups, shared by the service, escalation, public queries and
# notifications.
# Not yet published: the author may still change the content.
OPEN_STATES: frozenset[CapLifecycleState] = frozenset({_D, _S, _A})
# Reviewers may record a review (optional, audited, changes no state).
REVIEWABLE_STATES: frozenset[CapLifecycleState] = frozenset({_S, _A})
# Has been published at least once; these are the states the public may see.
EVER_PUBLISHED_STATES: frozenset[CapLifecycleState] = frozenset({_P, _E, _C})
# Published and then withdrawn or run out.
ENDED_STATES: frozenset[CapLifecycleState] = frozenset({_E, _C})


def can_transition(state: CapLifecycleState, action: CapAction) -> bool:
    return state in TRANSITIONS[action].allowed_from


def allowed_actions(state: CapLifecycleState) -> list[str]:
    """The offered actions the state allows.

    Computed from the state alone. Permissions, the cancel-only-Alert-or-Update
    rule and the approval policy are still enforced by the service.
    """
    return [action for action in OFFERED_ACTIONS if can_transition(state, action)]
