"""Pins webhook delivery status moves and its retry numbers (src/webhooks_out/delivery.py)."""

import pytest

from src import outbox
from src.utils.retry_state import RetryTransitionError
from src.webhooks_out import delivery
from src.webhooks_out.models import DeliveryStatus


@pytest.mark.parametrize("source", [DeliveryStatus.PENDING, DeliveryStatus.FAILED])
@pytest.mark.parametrize(
    "target",
    [DeliveryStatus.SUCCEEDED, DeliveryStatus.FAILED, DeliveryStatus.DEAD],
)
def test_an_unfinished_delivery_may_succeed_fail_again_or_die(
    source: DeliveryStatus, target: DeliveryStatus
) -> None:
    assert delivery.STATUS_MOVES.allows(source, target)


@pytest.mark.parametrize("finished", [DeliveryStatus.SUCCEEDED, DeliveryStatus.DEAD])
def test_a_finished_delivery_never_moves_again(finished: DeliveryStatus) -> None:
    for target in DeliveryStatus:
        with pytest.raises(RetryTransitionError):
            delivery.STATUS_MOVES.require(finished, target)


def test_a_failed_delivery_is_retried_on_the_outbox_schedule() -> None:
    # The 1st to 4th failures wait 60 s, 120 s, 240 s, 480 s; the 5th gives up.
    assert [outbox.retry_delay_seconds(n) for n in range(1, 5)] == [60, 120, 240, 480]
    assert outbox.MAX_ATTEMPTS == 5
