"""CAP alert lifecycle as a declared state machine. No database access.

    DRAFT -> SUBMITTED -> APPROVED -> PUBLISHED -> EXPIRED | CANCELLED

Every write to ``CapAlert.lifecycle_state`` is one of the actions in
``TRANSITIONS`` and goes through ``service._set_lifecycle``, which checks this
table before it assigns. The refusal messages stay with the callers, as they
were before the table existed.

Two writes are not transitions: a new alert starts as DRAFT (the column
default), and a cancellation message is created already PUBLISHED
(``CANCELLATION_STATE``), because it goes out at once.

Hazard profiles (``CapHazardProfile.state``) have their own, smaller table at the
end of this module:

    approve  DRAFT -> APPROVED       a second authorised reviewer approves the version

A profile version is created DRAFT and is never edited or returned to draft; a
change is a new version. ``profiles.approve`` writes through ``approve_profile``.
"""

from typing import Literal, NamedTuple

from .exceptions import CapStateError
from .models import CapHazardProfile, CapLifecycleState, CapProfileState

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


# --- Hazard profiles ---------------------------------------------------------

CapProfileAction = Literal["approve"]


class ProfileTransition(NamedTuple):
    allowed_from: frozenset[CapProfileState]
    target: CapProfileState


PROFILE_TRANSITIONS: dict[CapProfileAction, ProfileTransition] = {
    "approve": ProfileTransition(
        frozenset({CapProfileState.DRAFT}), CapProfileState.APPROVED
    ),
}

# Profile versions an alert draft may be started from, and that the impact
# matrix suggestion reads.
PROFILE_USABLE_STATES: frozenset[CapProfileState] = frozenset(
    {CapProfileState.APPROVED}
)

#: What a reviewer is told when the version is not a draft.
PROFILE_NOT_DRAFT = "Only draft profiles can be approved."


def profile_is_usable(state: str) -> bool:
    """Compares stored values, so a plain string from the database is safe to pass."""
    return state in {member.value for member in PROFILE_USABLE_STATES}


def can_move_profile(state: str, action: CapProfileAction) -> bool:
    """False for a move the table refuses and for a stored value it does not know."""
    try:
        return CapProfileState(state) in PROFILE_TRANSITIONS[action].allowed_from
    except ValueError:
        return False


def require_profile_move(state: str, action: CapProfileAction) -> None:
    """Raise the 409 the caller raised before the table existed."""
    if not can_move_profile(state, action):
        raise CapStateError(PROFILE_NOT_DRAFT)


def approve_profile(profile: CapHazardProfile) -> None:
    """Set ``profile.state`` to APPROVED after checking the table."""
    require_profile_move(profile.state, "approve")
    profile.state = PROFILE_TRANSITIONS["approve"].target.value
