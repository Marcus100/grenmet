"""Deduction arithmetic (slice 3). Pure; money in integer minor units, half-up.

Generic and table-driven: rates, allowances, bands and ceilings are dated rows
per organisation, so a new budget is a new row, not a code change.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from decimal import Decimal

from .models import DeductionKind, PayFrequency
from .pricing import to_minor

PERIODS_PER_YEAR = {PayFrequency.MONTHLY.value: 12, PayFrequency.FORTNIGHTLY.value: 26}


@dataclass(frozen=True)
class Band:
    width_minor: int | None  # None: everything above
    rate: Decimal


@dataclass(frozen=True)
class Split:
    base_minor: int
    employee_minor: int
    employer_minor: int


def periods_per_year(frequency: str) -> int:
    return PERIODS_PER_YEAR[frequency]


def insurable_ceiling(
    frequency: str,
    *,
    monthly_minor: int,
    weekly_minor: int,
    fortnightly_minor: int | None,
) -> int:
    """Per-period insurable ceiling. A fortnight is the weekly ceiling x 2 unless
    the scheme states its own fortnightly ceiling."""
    if frequency == PayFrequency.FORTNIGHTLY:
        return fortnightly_minor if fortnightly_minor is not None else weekly_minor * 2
    return monthly_minor


def social_insurance(
    gross_minor: int, ceiling_minor: int, employee_rate: Decimal, employer_rate: Decimal
) -> Split:
    insurable = max(0, min(gross_minor, ceiling_minor))
    return Split(
        base_minor=insurable,
        employee_minor=to_minor(Decimal(insurable) * employee_rate),
        employer_minor=to_minor(Decimal(insurable) * employer_rate),
    )


def annual_tax(chargeable_minor: int, bands: Sequence[Band]) -> Decimal:
    remaining = Decimal(max(0, chargeable_minor))
    tax = Decimal(0)
    for band in bands:
        if remaining <= 0:
            break
        slice_ = (
            remaining
            if band.width_minor is None
            else min(remaining, Decimal(band.width_minor))
        )
        tax += slice_ * band.rate
        remaining -= slice_
    return tax


def income_tax_annualised(
    taxable_minor: int, *, periods: int, allowance_minor: int, bands: Sequence[Band]
) -> Split:
    """Period pay x periods a year, less the annual allowance, through the bands,
    then back to one period."""
    annual = max(0, taxable_minor) * periods
    chargeable = max(0, annual - allowance_minor)
    return Split(
        base_minor=max(0, taxable_minor),
        employee_minor=to_minor(annual_tax(chargeable, bands) / Decimal(periods)),
        employer_minor=0,
    )


def other_deduction(
    kind: str,
    *,
    basic_minor: int,
    gross_minor: int,
    employee_rate: Decimal | None,
    employer_rate: Decimal | None,
    employee_amount_minor: int | None,
    employer_amount_minor: int | None,
    premium_minor: int | None,
    employee_share: Decimal | None,
) -> Split | None:
    """None when the type lacks the figure it needs (never deducted as zero)."""
    if kind in {DeductionKind.PERCENT_OF_BASIC, DeductionKind.PERCENT_OF_GROSS}:
        base = basic_minor if kind == DeductionKind.PERCENT_OF_BASIC else gross_minor
        if employee_rate is None and employer_rate is None:
            return None
        return Split(
            base_minor=base,
            employee_minor=to_minor(Decimal(base) * (employee_rate or 0)),
            employer_minor=to_minor(Decimal(base) * (employer_rate or 0)),
        )
    if kind == DeductionKind.FIXED:
        if employee_amount_minor is None and employer_amount_minor is None:
            return None
        return Split(
            base_minor=0,
            employee_minor=employee_amount_minor or 0,
            employer_minor=employer_amount_minor or 0,
        )
    if premium_minor is None or employee_share is None:
        return None
    employee = to_minor(Decimal(premium_minor) * employee_share)
    return Split(
        base_minor=premium_minor,
        employee_minor=employee,
        employer_minor=premium_minor - employee,
    )
