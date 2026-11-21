"""Per-event refund policy and cancellation fee: the pure rules (no database).

``refund_due`` decides how much money goes back for one order. ``paid_terms_conflict``
says whether a change to the terms is stricter than what buyers already agreed to
once a paid order exists. Schema tests cover the listing fields.
"""

from datetime import datetime, timedelta
from typing import Any

import pytest
from pydantic import ValidationError

from src.events import refund_policy as rp
from src.events import schemas
from src.events.config import events_settings

NOW = datetime(2026, 11, 21, 12, 0)


def _due(
    choice: str = "follow_policy",
    *,
    policy: str = "refundable",
    cutoff: int | None = None,
    fee_type: str = "none",
    fee_value: int = 0,
    event_cancelled: bool = False,
    hours_away: float = 100,
    refundable: int = 10_000,
    tickets: int = 2,
) -> int:
    return rp.refund_due(
        choice,
        policy=policy,
        cutoff_hours=cutoff,
        fee_type=fee_type,
        fee_value=fee_value,
        event_cancelled=event_cancelled,
        starts_at=NOW + timedelta(hours=hours_away),
        now=NOW,
        refundable_minor=refundable,
        ticket_count=tickets,
    )


# --- refund_due: choices ---------------------------------------------------------------


def test_full_refunds_everything_whatever_the_policy_and_fee() -> None:
    due = _due(
        "full", policy="no_refunds", fee_type="fixed", fee_value=999, hours_away=1
    )
    assert due == 10_000


def test_none_keeps_everything() -> None:
    assert _due("none") == 0


def test_an_unknown_choice_is_rejected() -> None:
    with pytest.raises(ValueError):
        _due("maybe")


# --- refund_due: follow_policy ----------------------------------------------------------


def test_event_cancelled_is_refunded_in_full_and_ignores_the_fee() -> None:
    due = _due(
        policy="no_refunds",
        fee_type="percent",
        fee_value=100,
        event_cancelled=True,
        hours_away=1,
    )
    assert due == 10_000
    assert (
        _due(fee_type="fixed", fee_value=5_000, event_cancelled=True, hours_away=1)
        == 10_000
    )


def test_no_refunds_policy_keeps_the_money() -> None:
    assert _due(policy="no_refunds") == 0


def test_inside_the_cutoff_keeps_the_money() -> None:
    assert _due(hours_away=47.9) == 0


def test_exactly_at_the_cutoff_is_outside_it() -> None:
    assert _due(hours_away=48) == 10_000


def test_before_the_cutoff_with_no_fee_refunds_everything() -> None:
    assert _due(hours_away=100) == 10_000


def test_a_fixed_fee_is_taken_per_ticket_cancelled() -> None:
    assert _due(fee_type="fixed", fee_value=1_500, tickets=3) == 10_000 - 4_500


def test_a_fixed_fee_larger_than_the_amount_floors_at_zero() -> None:
    assert _due(fee_type="fixed", fee_value=100_000, tickets=2) == 0


def test_a_percent_fee_is_taken_on_the_refundable_amount() -> None:
    assert _due(fee_type="percent", fee_value=10) == 9_000


def test_a_hundred_percent_fee_keeps_everything() -> None:
    assert _due(fee_type="percent", fee_value=100) == 0


@pytest.mark.parametrize(
    ("refundable", "percent", "fee", "refund"),
    [
        (101, 50, 51, 50),  # 50.5 rounds half up to 51
        (1, 50, 1, 0),  # 0.5 rounds up to 1, so nothing is left
        (101, 49, 49, 52),  # 49.49 rounds down to 49
        (199, 50, 100, 99),  # 99.5 rounds up to 100
    ],
)
def test_percent_fee_rounds_half_up(
    refundable: int, percent: int, fee: int, refund: int
) -> None:
    assert (
        rp.cancellation_fee_minor(
            fee_type="percent",
            fee_value=percent,
            refundable_minor=refundable,
            ticket_count=1,
        )
        == fee
    )
    assert (
        _due(
            fee_type="percent",
            fee_value=percent,
            refundable=refundable,
        )
        == refundable - (refundable * percent + 50) // 100
    )
    assert refund == refundable - fee


def test_a_null_cutoff_uses_the_platform_default() -> None:
    assert events_settings.REFUND_CUTOFF_HOURS == 48
    assert rp.effective_cutoff_hours(None) == 48
    assert _due(cutoff=None, hours_away=47) == 0
    assert _due(cutoff=None, hours_away=49) == 10_000


def test_a_custom_cutoff_replaces_the_default() -> None:
    assert rp.effective_cutoff_hours(72) == 72
    assert _due(cutoff=72, hours_away=71) == 0
    assert _due(cutoff=72, hours_away=73) == 10_000
    assert _due(cutoff=0, hours_away=0.5) == 10_000


# --- paid_terms_conflict: once a paid order exists, only more generous terms ------------


def _terms(
    policy: str = "refundable",
    cutoff: int | None = None,
    fee_type: str = "none",
    fee_value: int = 0,
) -> rp.Terms:
    return rp.Terms(
        policy=policy, cutoff_hours=cutoff, fee_type=fee_type, fee_value=fee_value
    )


@pytest.mark.parametrize(
    ("old", "new"),
    [
        (_terms("no_refunds"), _terms("refundable")),
        (_terms(cutoff=72), _terms(cutoff=48)),
        (_terms(cutoff=None), _terms(cutoff=24)),
        (_terms(cutoff=None), _terms(cutoff=48)),
        (
            _terms(fee_type="fixed", fee_value=800),
            _terms(fee_type="fixed", fee_value=500),
        ),
        (
            _terms(fee_type="percent", fee_value=20),
            _terms(fee_type="percent", fee_value=10),
        ),
        (_terms(fee_type="fixed", fee_value=500), _terms()),
        (
            _terms(fee_type="percent", fee_value=20),
            _terms(fee_type="fixed", fee_value=0),
        ),
        (
            _terms(fee_type="fixed", fee_value=500),
            _terms(fee_type="percent", fee_value=0),
        ),
    ],
)
def test_loosening_is_always_allowed_once_paid(old: rp.Terms, new: rp.Terms) -> None:
    assert rp.paid_terms_conflict(old, new) is None


def test_switching_refunds_off_is_stricter() -> None:
    message = rp.paid_terms_conflict(_terms(), _terms("no_refunds"))
    assert message is not None
    assert "refundable" in message and "more generous" in message


def test_a_longer_cutoff_is_stricter_and_null_counts_as_the_default() -> None:
    message = rp.paid_terms_conflict(_terms(cutoff=None), _terms(cutoff=72))
    assert message is not None
    assert "48 hours" in message
    assert rp.paid_terms_conflict(_terms(cutoff=24), _terms(cutoff=72)) is not None
    # Setting the default explicitly is the same cutoff, not a stricter one.
    assert rp.paid_terms_conflict(_terms(cutoff=None), _terms(cutoff=48)) is None


@pytest.mark.parametrize(
    "new",
    [
        _terms(fee_type="fixed", fee_value=100),
        _terms(fee_type="fixed", fee_value=900),
        _terms(fee_type="percent", fee_value=5),
    ],
)
def test_adding_any_fee_to_a_fee_free_event_is_stricter(new: rp.Terms) -> None:
    message = rp.paid_terms_conflict(_terms(), new)
    assert message is not None
    assert "cancellation fee" in message


def test_a_higher_fixed_fee_is_stricter() -> None:
    assert (
        rp.paid_terms_conflict(
            _terms(fee_type="fixed", fee_value=500),
            _terms(fee_type="fixed", fee_value=800),
        )
        is not None
    )


def test_a_higher_percent_fee_is_stricter() -> None:
    assert (
        rp.paid_terms_conflict(
            _terms(fee_type="percent", fee_value=10),
            _terms(fee_type="percent", fee_value=20),
        )
        is not None
    )


@pytest.mark.parametrize(
    ("old", "new"),
    [
        (
            _terms(fee_type="fixed", fee_value=500),
            _terms(fee_type="percent", fee_value=10),
        ),
        (
            _terms(fee_type="percent", fee_value=10),
            _terms(fee_type="fixed", fee_value=500),
        ),
    ],
)
def test_switching_between_fixed_and_percent_is_stricter_unless_the_fee_is_zero(
    old: rp.Terms, new: rp.Terms
) -> None:
    assert rp.paid_terms_conflict(old, new) is not None


# --- schema: listing fields ---------------------------------------------------------------


def _upsert(**changes: Any) -> dict[str, Any]:
    start = NOW + timedelta(days=10)
    body: dict[str, Any] = {
        "title": "Harbour Lights Fete",
        "summary": "Lantern night on the water",
        "parish": "st-george",
        "venue": "Carenage",
        "starts_at": f"{start.isoformat()}Z",
        "ends_at": f"{(start + timedelta(hours=5)).isoformat()}Z",
        "admission": "ticketed",
        "capacity": 300,
        "status": "published",
        "tiers": [{"name": "General", "price_minor": 5_000, "allocation": 50}],
    }
    body.update(changes)
    return body


def test_a_fee_value_without_a_fee_type_is_rejected() -> None:
    with pytest.raises(ValidationError):
        schemas.ListingUpsert(**_upsert(cancellation_fee_value=500))
    with pytest.raises(ValidationError):
        schemas.ListingUpsert(**_upsert(cancellation_fee_value=0))


def test_a_fixed_or_percent_fee_needs_its_value() -> None:
    with pytest.raises(ValidationError):
        schemas.ListingUpsert(**_upsert(cancellation_fee_type="fixed"))
    with pytest.raises(ValidationError):
        schemas.ListingUpsert(**_upsert(cancellation_fee_type="percent"))


def test_a_none_fee_must_be_zero() -> None:
    with pytest.raises(ValidationError):
        schemas.ListingUpsert(
            **_upsert(cancellation_fee_type="none", cancellation_fee_value=500)
        )
    body = schemas.ListingUpsert(**_upsert(cancellation_fee_type="none"))
    assert body.cancellation_fee_type == "none"


def test_a_percent_fee_over_100_is_rejected_and_100_is_allowed() -> None:
    with pytest.raises(ValidationError):
        schemas.ListingUpsert(
            **_upsert(cancellation_fee_type="percent", cancellation_fee_value=101)
        )
    body = schemas.ListingUpsert(
        **_upsert(cancellation_fee_type="percent", cancellation_fee_value=100)
    )
    assert body.cancellation_fee_value == 100


def test_a_fixed_fee_above_the_lowest_paid_tier_is_rejected() -> None:
    tiers = [
        {"name": "General", "price_minor": 5_000, "allocation": 50},
        {"name": "Early", "price_minor": 3_000, "allocation": 10},
    ]
    with pytest.raises(ValidationError):
        schemas.ListingUpsert(
            **_upsert(
                tiers=tiers, cancellation_fee_type="fixed", cancellation_fee_value=3_001
            )
        )
    ok = schemas.ListingUpsert(
        **_upsert(
            tiers=tiers, cancellation_fee_type="fixed", cancellation_fee_value=3_000
        )
    )
    assert ok.cancellation_fee_value == 3_000


def test_free_tiers_do_not_cap_a_fixed_fee() -> None:
    tiers = [{"name": "Free", "price_minor": 0, "allocation": 10}]
    body = schemas.ListingUpsert(
        **_upsert(
            tiers=tiers, cancellation_fee_type="fixed", cancellation_fee_value=9_000
        )
    )
    assert body.cancellation_fee_value == 9_000


@pytest.mark.parametrize("hours", [-1, 721])
def test_a_cutoff_out_of_range_is_rejected(hours: int) -> None:
    with pytest.raises(ValidationError):
        schemas.ListingUpsert(**_upsert(refund_cutoff_hours=hours))


@pytest.mark.parametrize("hours", [0, 48, 720, None])
def test_a_cutoff_in_range_or_null_is_accepted(hours: int | None) -> None:
    assert (
        schemas.ListingUpsert(**_upsert(refund_cutoff_hours=hours)).refund_cutoff_hours
        == hours
    )


def test_an_unknown_refund_policy_is_rejected() -> None:
    with pytest.raises(ValidationError):
        schemas.ListingUpsert(**_upsert(refund_policy="sometimes"))
