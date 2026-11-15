"""Organisation verification as a declared table. No database access.

``PlatformOrganisation`` keeps four fields that describe one verification state:
``verification_status`` (the moderation state), ``verified_at`` (the single "is
verified" signal), ``verification_decided_at`` and ``verification_reason`` (the latest
decision). One move per action:

    approve     PENDING, REJECTED -> APPROVED    sets verified_at
    reject      PENDING -> REJECTED              verified_at stays empty
    withdraw    APPROVED -> PENDING              clears verified_at
    resubmit    REJECTED -> PENDING              the organiser asks for review again

The invariant this module keeps: ``verified_at`` is set exactly when the status is
APPROVED. Migration 2026-10-22 backfilled the status that way, and every write goes
through ``move_verification``, which sets the status and ``verified_at`` together.

The decision time and reason belong to a decision, not to a resubmission, so the
service sets them after a decision move and leaves them alone on resubmit.

Memberships (``Membership.status``) have their own table at the end of this module.
There is one row per organisation and person, so leaving and coming back reuse it:

    remove      ACTIVE -> REMOVED              the member is taken off the organisation;
                                               the caller ends their grants with it
    reactivate  INVITED, REMOVED -> ACTIVE     an invitation is accepted, or an admin
                                               adds the person again

A membership is created ACTIVE by the insert (not a move). INVITED is a declared
status that no code path writes today; it is kept in ``reactivate`` because the code
has always reactivated any row that is not ACTIVE. Every later write to
``Membership.status`` goes through ``move_membership``.
"""

from datetime import datetime
from typing import Literal, NamedTuple

from src.exceptions import AppException

from .models import (
    Membership,
    MembershipStatus,
    PlatformOrganisation,
    VerificationStatus,
)

VerificationMove = Literal["approve", "reject", "withdraw", "resubmit"]


class VerificationTransition(NamedTuple):
    allowed_from: frozenset[VerificationStatus]
    target: VerificationStatus


_P = VerificationStatus.PENDING
_A = VerificationStatus.APPROVED
_R = VerificationStatus.REJECTED

TRANSITIONS: dict[VerificationMove, VerificationTransition] = {
    "approve": VerificationTransition(frozenset({_P, _R}), _A),
    "reject": VerificationTransition(frozenset({_P}), _R),
    "withdraw": VerificationTransition(frozenset({_A}), _P),
    "resubmit": VerificationTransition(frozenset({_R}), _P),
}


def can_move(state: VerificationStatus, move: VerificationMove) -> bool:
    return state in TRANSITIONS[move].allowed_from


def move_verification(
    organisation: PlatformOrganisation,
    move: VerificationMove,
    *,
    at: datetime | None = None,
    refusal: str | None = None,
) -> None:
    """Set the verification status, and ``verified_at`` with it.

    ``approve`` sets ``verified_at`` to ``at``; every other move clears it, so it is set
    exactly when the status is APPROVED. Raises a 409 when the
    table does not allow the move, or when the stored status is not a declared one."""
    try:
        state = VerificationStatus(organisation.verification_status)
    except ValueError:
        raise AppException(
            f"This organisation has an unknown verification status "
            f"'{organisation.verification_status}'",
            409,
        ) from None
    if not can_move(state, move):
        raise AppException(
            refusal or f"A verification cannot {move} from status {state.value}", 409
        )
    organisation.verification_status = TRANSITIONS[move].target.value
    if move == "approve":
        if at is None:
            raise ValueError("Approving needs the time it was approved")
        organisation.verified_at = at
    else:
        organisation.verified_at = None


# --- Memberships -------------------------------------------------------------

MembershipMove = Literal["remove", "reactivate"]


class MembershipTransition(NamedTuple):
    allowed_from: frozenset[MembershipStatus]
    target: MembershipStatus


MEMBERSHIP_TRANSITIONS: dict[MembershipMove, MembershipTransition] = {
    "remove": MembershipTransition(
        frozenset({MembershipStatus.ACTIVE}), MembershipStatus.REMOVED
    ),
    "reactivate": MembershipTransition(
        frozenset({MembershipStatus.INVITED, MembershipStatus.REMOVED}),
        MembershipStatus.ACTIVE,
    ),
}


def can_move_membership(state: MembershipStatus, move: MembershipMove) -> bool:
    return state in MEMBERSHIP_TRANSITIONS[move].allowed_from


def move_membership(membership: Membership, move: MembershipMove) -> None:
    """Set ``membership.status`` to the move's target. Raises a 409 when the table
    does not allow the move, or when the stored value is not a declared status."""
    try:
        state = MembershipStatus(membership.status)
    except ValueError:
        raise AppException(
            f"This membership has an unknown status '{membership.status}'", 409
        ) from None
    if not can_move_membership(state, move):
        raise AppException(f"A membership cannot {move} from status {state.value}", 409)
    membership.status = MEMBERSHIP_TRANSITIONS[move].target.value
