"""Gross pay arithmetic (slice 2). Pure functions; money in integer minor units.

Follows the billing money pattern: Decimal arithmetic, every line rounded
half-up to a whole minor unit, totals are sums of rounded lines.

- Hourly rate: an HOURLY basic is the rate itself; a SALARIED basic is the
  monthly basic divided by the person's standard monthly hours.
- HOURLY_MULTIPLIER rate: quantity x hourly rate x multiplier. A salaried
  person's base hours are covered by the basic salary line, so they are not
  priced again.
- FIXED_AMOUNT rate: quantity x amount, plus, when the rate guarantees hours
  (call-out: 4 hours of overtime), quantity x guaranteed hours x hourly rate x
  guaranteed multiplier.
- No rate, or a multiplier rate with no basic pay on file: the line is not
  priced (amount None), never priced at zero.
"""

import calendar
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import ROUND_HALF_UP, Decimal

from .models import PayBasis, PayItemMethod, RateKind

RATE_PLACES = Decimal("0.0001")


def to_minor(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


@dataclass(frozen=True)
class BasicPayFacts:
    id: object
    pay_basis: str
    amount_minor: int
    standard_monthly_hours: Decimal
    effective_from: date
    effective_to: date | None

    def hourly_rate(self) -> Decimal:
        if self.pay_basis == PayBasis.HOURLY:
            return Decimal(self.amount_minor)
        return (Decimal(self.amount_minor) / self.standard_monthly_hours).quantize(
            RATE_PLACES, rounding=ROUND_HALF_UP
        )

    def covers(self, day: date) -> bool:
        return self.effective_from <= day and (
            self.effective_to is None or day <= self.effective_to
        )


@dataclass(frozen=True)
class RateFacts:
    id: object
    rate_kind: str
    multiplier: Decimal | None
    amount_minor: int | None
    guaranteed_hours: Decimal | None
    guaranteed_multiplier: Decimal | None
    effective_from: date
    effective_to: date | None

    def covers(self, day: date) -> bool:
        return self.effective_from <= day and (
            self.effective_to is None or day <= self.effective_to
        )


@dataclass(frozen=True)
class Price:
    amount_minor: int | None
    hourly_rate: Decimal | None = None
    multiplier: Decimal | None = None
    fixed_amount_minor: int | None = None


UNPRICED = Price(None)


def price_line(
    *,
    quantity: Decimal,
    method: str,
    rate: RateFacts | None,
    basic: BasicPayFacts | None,
) -> Price:
    if rate is None:
        return UNPRICED
    hourly = basic.hourly_rate() if basic else None
    if rate.rate_kind == RateKind.HOURLY_MULTIPLIER:
        if hourly is None or rate.multiplier is None or basic is None:
            return UNPRICED
        if (
            method == PayItemMethod.ATTENDANCE_BASE
            and basic.pay_basis == PayBasis.SALARIED
        ):
            return UNPRICED  # covered by the basic salary line
        return Price(
            amount_minor=to_minor(quantity * hourly * rate.multiplier),
            hourly_rate=hourly,
            multiplier=rate.multiplier,
        )
    if rate.amount_minor is None:
        return UNPRICED
    amount = quantity * Decimal(rate.amount_minor)
    if rate.guaranteed_hours and rate.guaranteed_multiplier and hourly is not None:
        amount += quantity * rate.guaranteed_hours * hourly * rate.guaranteed_multiplier
    return Price(
        amount_minor=to_minor(amount),
        hourly_rate=hourly,
        multiplier=rate.guaranteed_multiplier,
        fixed_amount_minor=rate.amount_minor,
    )


def month_fraction(basic: BasicPayFacts, start: date, end: date) -> Decimal:
    """Share of a calendar month a salaried basic covers inside [start, end].

    Days covered divided by the days in the month the period starts in, so a
    full calendar-month period is exactly 1.
    """
    lo = max(start, basic.effective_from)
    hi = min(end, basic.effective_to or end)
    if hi < lo:
        return Decimal(0)
    days = (hi - lo + timedelta(days=1)).days
    month_days = calendar.monthrange(start.year, start.month)[1]
    return Decimal(days) / Decimal(month_days)


def basic_salary_minor(basic: BasicPayFacts, fraction: Decimal) -> int:
    return to_minor(Decimal(basic.amount_minor) * fraction)
