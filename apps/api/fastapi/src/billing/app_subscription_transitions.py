"""App subscription status as a declared table. No database access.

One subscription (``AppSubscription.status``), reached by Stripe's reports. The
table says, for each target status, which statuses it may be reached from:

    ACTIVE     from INCOMPLETE, PAST_DUE, UNPAID   (a payment clears it)
    PAST_DUE   from ACTIVE, UNPAID                 (a payment failed)
    UNPAID     from ACTIVE, PAST_DUE               (retries ran out)
    CANCELED   from INCOMPLETE, ACTIVE, PAST_DUE, UNPAID (ended, or checkout expired)

CANCELED has no way out: a canceled subscription stays canceled. INCOMPLETE is never a
target; a row starts there when its checkout is created.

``move_app_subscription`` is the one writer of ``AppSubscription.status``. Asking for the
status a row already has is a no-op, so a repeated provider report changes nothing.
A move the table refuses raises ``AppSubscriptionStateError``; the webhook logs that
and still answers 2xx, because Stripe is the authority and a retry cannot fix it.
"""

from typing import Any

from .exceptions import AppSubscriptionStateError
from .models import AppSubscriptionStatus

_I = AppSubscriptionStatus.INCOMPLETE
_A = AppSubscriptionStatus.ACTIVE
_PD = AppSubscriptionStatus.PAST_DUE
_C = AppSubscriptionStatus.CANCELED
_U = AppSubscriptionStatus.UNPAID

#: target status -> the statuses it may be reached from.
TRANSITIONS: dict[AppSubscriptionStatus, frozenset[AppSubscriptionStatus]] = {
    _A: frozenset({_I, _PD, _U}),
    _PD: frozenset({_A, _U}),
    _U: frozenset({_A, _PD}),
    _C: frozenset({_I, _A, _PD, _U}),
}


def can_move(state: AppSubscriptionStatus, target: AppSubscriptionStatus) -> bool:
    if state is target:
        return True
    return state in TRANSITIONS.get(target, frozenset())


def move_app_subscription(subscription: Any, target: AppSubscriptionStatus) -> None:
    """Set ``subscription.status`` to ``target`` when the table allows the move."""
    try:
        state = AppSubscriptionStatus(subscription.status)
    except ValueError:
        raise AppSubscriptionStateError(
            f"This subscription has an unknown status '{subscription.status}'"
        ) from None
    if state is target:
        return
    if not can_move(state, target):
        raise AppSubscriptionStateError(
            f"A subscription cannot move from {state.value} to {target.value}"
        )
    subscription.status = target.value
