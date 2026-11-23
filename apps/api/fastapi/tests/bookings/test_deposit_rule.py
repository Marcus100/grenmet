"""The business-wide deposit rule (owner request 23 Nov 2026), pure: no database.

Effective deposit = the service's own ``deposit_minor`` when > 0, else the business
rule applied to the price (``percent`` rounded up to whole currency units, ``fixed``
per booking), never more than the price. Default ``none`` changes nothing."""

import pytest

from src.bookings import deposit_payments as dp
from src.bookings.models import BookingDepositMode, Service

NONE = dp.DepositRule()


def percent(value: int) -> dp.DepositRule:
    return dp.DepositRule(mode=BookingDepositMode.PERCENT.value, percent=value)


def fixed(minor: int) -> dp.DepositRule:
    return dp.DepositRule(mode=BookingDepositMode.FIXED.value, fixed_minor=minor)


def service(price: int, deposit: int = 0) -> Service:
    return Service(price_minor=price, deposit_minor=deposit)


# --- the business rule alone ---------------------------------------------------------


@pytest.mark.parametrize(
    ("price", "value", "expected"),
    [
        (21000, 50, 10500),  # exact: XCD 210.00 at 50% is XCD 105.00
        (21000, 100, 21000),  # a full deposit is the full price
        (21000, 1, 300),  # 2.10 at 1% rounds up to XCD 3.00
        (21000, 15, 3200),  # 31.50 rounds up to XCD 32.00, not down
        (10000, 33, 3300),  # 33.00 exact stays XCD 33.00 (no extra unit)
        (10001, 33, 3400),  # 33.0033 rounds up to XCD 34.00
    ],
)
def test_percent_rounds_up_to_whole_currency_units(
    price: int, value: int, expected: int
) -> None:
    assert dp.rule_deposit(price, percent(value)) == expected


def test_percent_never_exceeds_the_price_and_is_never_zero_for_a_priced_service() -> (
    None
):
    # One minor unit at 1%: rounding up gives XCD 1.00 but the cap keeps it at the price.
    assert dp.rule_deposit(1, percent(1)) == 1
    assert dp.rule_deposit(1, percent(100)) == 1


@pytest.mark.parametrize("price", [0, -5])
def test_a_free_service_has_no_deposit(price: int) -> None:
    assert dp.rule_deposit(price, percent(50)) == 0
    assert dp.rule_deposit(price, fixed(500)) == 0


def test_fixed_amount_is_per_booking_and_capped_at_the_price() -> None:
    assert dp.rule_deposit(21000, fixed(5000)) == 5000
    assert dp.rule_deposit(21000, fixed(30000)) == 21000
    assert dp.rule_deposit(21000, fixed(21000)) == 21000


def test_rule_none_gives_no_deposit() -> None:
    assert dp.rule_deposit(21000, NONE) == 0


# --- the effective deposit: service override first -------------------------------------


def test_a_service_deposit_wins_over_the_business_rule() -> None:
    svc = service(21000, deposit=5000)
    assert dp.planned_deposit(svc, percent(50)) == 5000
    assert dp.planned_deposit(svc, fixed(9000)) == 5000


def test_a_service_deposit_applies_with_no_rule() -> None:
    assert dp.planned_deposit(service(21000, deposit=5000), NONE) == 5000


def test_the_rule_applies_when_the_service_has_no_deposit() -> None:
    assert dp.planned_deposit(service(21000), percent(50)) == 10500
    assert dp.planned_deposit(service(21000), fixed(5000)) == 5000


def test_default_off_keeps_the_old_behaviour_exactly() -> None:
    """Regression: a business with the default rule (none) charges exactly what the
    per-service deposit says and nothing more, as before this rule existed."""
    assert dp.planned_deposit(service(21000), NONE) == 0
    assert dp.planned_deposit(service(21000, deposit=0), NONE) == 0
    assert dp.planned_deposit(service(21000, deposit=5000), NONE) == 5000


# --- what a booking is due, with entitlement and the full-price setting ------------------


def test_no_entitlement_means_no_deposit_whatever_the_rule() -> None:
    assert (
        dp.due_for(service(21000), full_price=False, entitled=False, rule=percent(50))
        == 0
    )
    assert (
        dp.due_for(service(21000, 5000), full_price=False, entitled=False, rule=NONE)
        == 0
    )


def test_full_price_setting_still_charges_the_price_first() -> None:
    assert (
        dp.due_for(service(21000), full_price=True, entitled=True, rule=percent(10))
        == 21000
    )


def test_entitled_booking_uses_the_planned_deposit() -> None:
    assert (
        dp.due_for(service(21000), full_price=False, entitled=True, rule=percent(50))
        == 10500
    )


# --- what the customer and the business see -----------------------------------------------


def test_balance_at_the_salon_is_the_price_less_the_deposit() -> None:
    assert dp.balance_at_salon(21000, 10500) == 10500
    assert dp.balance_at_salon(21000, 0) == 21000
    assert dp.balance_at_salon(21000, 21000) == 0


def test_the_money_text_follows_the_currency_style() -> None:
    assert dp.money_text(10500, "XCD") == "XCD 105.00"
    assert dp.money_text(123456, "XCD") == "XCD 1,234.56"
