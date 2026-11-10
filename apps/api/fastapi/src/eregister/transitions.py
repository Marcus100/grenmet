"""Register observation lifecycle as a declared state machine. No database access.

    draft, qc_pending -> accepted | rejected          (accept, reject)
    accepted, rejected -> qc_pending                  (reopen)
    draft, qc_pending, accepted -> superseded         (correct: the original)
    superseded -> the state recorded on the row       (restore, when a correction is rejected)
    draft, qc_pending -> draft                        (save_draft: the observer re-saves, unsent only)

Every write to ``register_observations.state`` made by a transition goes through
``guard`` or ``can_transition`` first. ``sent`` is not a column: a hand-off is
"sent" when an ``eregister_send`` row is queued or sent, and the callers look that
up (the send log lives in the application database). Two keyword flags carry it:
``wis2_sent`` for the WIS2 file and ``any_sent`` for an email or WIS2 file.

The refusal messages stay with the callers, as before the table existed; ``guard``
takes the message and raises it as a 409 ``AppException``.

This module is a leaf: ``qc``, ``entries`` and ``sends`` import it, and it imports
none of them, so the table can be read without importing any database code.
"""

from typing import Literal, NamedTuple

from src.exceptions import AppException

RegisterState = Literal["draft", "qc_pending", "accepted", "rejected", "superseded"]

RegisterAction = Literal[
    "accept",
    "reject",
    "reopen",
    "correct",
    "save_draft",
    "restore",
]


class Transition(NamedTuple):
    allowed_from: frozenset[RegisterState]
    # None: the state is not fixed by the table. "restore" returns the earlier
    # state recorded on the superseded row (``superseded_from``).
    target: RegisterState | None


DRAFT: RegisterState = "draft"
QC_PENDING: RegisterState = "qc_pending"
ACCEPTED: RegisterState = "accepted"
REJECTED: RegisterState = "rejected"
SUPERSEDED: RegisterState = "superseded"

# Named state groups.
# Awaiting acceptance: the observer may still change the content (unsent only).
PENDING_STATES: frozenset[RegisterState] = frozenset({DRAFT, QC_PENDING})
# Not rejected and not superseded: the live reading for its hour. A reviewer may
# record a review; it can be corrected.
LIVE_STATES: frozenset[RegisterState] = frozenset({DRAFT, QC_PENDING, ACCEPTED})
REVIEWABLE_STATES: frozenset[RegisterState] = LIVE_STATES
# Rejected or superseded: never sent, and not public.
NOT_SENDABLE_STATES: frozenset[RegisterState] = frozenset({REJECTED, SUPERSEDED})

TRANSITIONS: dict[RegisterAction, Transition] = {
    # QC: the observer, or other register staff, accept a SYNOP after validation.
    "accept": Transition(PENDING_STATES, ACCEPTED),
    # QC: a reason is required (qc.py). Refused once a WIS2 file is queued or sent.
    "reject": Transition(PENDING_STATES, REJECTED),
    # QC: back to qc_pending. Refused once a WIS2 file is queued or sent.
    "reopen": Transition(frozenset({ACCEPTED, REJECTED}), QC_PENDING),
    # A replacement supersedes the original (entries.correct).
    "correct": Transition(LIVE_STATES, SUPERSEDED),
    # The observer re-saves the same hour in place (entries.create). Refused once
    # any email or WIS2 file is queued or sent. Sets the row back to draft, even
    # from qc_pending.
    "save_draft": Transition(PENDING_STATES, DRAFT),
    # A rejected correction gives the original back its earlier state (qc).
    "restore": Transition(frozenset({SUPERSEDED}), None),
}

# Actions that a WIS2 file already queued or sent refuses.
BLOCKED_BY_WIS2: frozenset[RegisterAction] = frozenset({"reject", "reopen"})
# Actions that any queued or sent hand-off (email or WIS2) refuses.
BLOCKED_BY_ANY_SEND: frozenset[RegisterAction] = frozenset({"save_draft"})
# Actions that only a SYNOP may take (the METAR and SPECI rows are not QC'd).
SYNOP_ONLY: frozenset[RegisterAction] = frozenset({"accept"})

# What the staff desk offers on an observation (the API field ``allowed_actions``).
# The other actions are a form save or a side effect, not a button.
OFFERED_ACTIONS: tuple[RegisterAction, ...] = ("accept", "reject", "reopen", "correct")


def state_allows(state: RegisterState, action: RegisterAction) -> bool:
    return state in TRANSITIONS[action].allowed_from


def fixed_target(action: RegisterAction) -> RegisterState:
    """The state the action leaves the row in. ``restore`` has none fixed."""
    target = TRANSITIONS[action].target
    if target is None:
        raise ValueError(f"{action} leaves the state recorded on the row")
    return target


def send_allows(
    action: RegisterAction, *, wis2_sent: bool = False, any_sent: bool = False
) -> bool:
    if action in BLOCKED_BY_WIS2 and wis2_sent:
        return False
    return not (action in BLOCKED_BY_ANY_SEND and any_sent)


def can_transition(
    state: RegisterState,
    action: RegisterAction,
    *,
    wis2_sent: bool = False,
    any_sent: bool = False,
) -> bool:
    return state_allows(state, action) and send_allows(
        action, wis2_sent=wis2_sent, any_sent=any_sent
    )


def guard(
    state: RegisterState,
    action: RegisterAction,
    *,
    refusal: str,
    wis2_sent: bool = False,
    any_sent: bool = False,
) -> None:
    """Raise ``refusal`` as a 409 unless the state and the sends allow ``action``."""
    if not can_transition(state, action, wis2_sent=wis2_sent, any_sent=any_sent):
        raise AppException(refusal, 409)


def allowed_actions(
    state: RegisterState,
    *,
    synop: bool,
    wis2_sent: bool = False,
    any_sent: bool = False,
) -> list[str]:
    """The offered actions the state allows, in ``OFFERED_ACTIONS`` order.

    ``synop`` applies the SYNOP-only rule. Permissions, the four-eyes rule and the
    validation of the workbook are not part of the table; the service enforces them.
    """
    return [
        action
        for action in OFFERED_ACTIONS
        if (synop or action not in SYNOP_ONLY)
        and can_transition(state, action, wis2_sent=wis2_sent, any_sent=any_sent)
    ]
