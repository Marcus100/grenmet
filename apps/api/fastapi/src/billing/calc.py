"""Invoice arithmetic. Pure functions, all money in integer minor units.

Rounding is half-up per line: the line subtotal is ``quantity x unit price``
rounded to a whole minor unit, then the line tax is that subtotal times the rate
rounded the same way. Invoice totals are the sums of the rounded line figures,
so what the PDF shows always adds up.
"""

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from .models import ReminderStage

HUNDRED = Decimal(100)


def to_minor(value: Decimal) -> int:
    return int(value.quantize(Decimal(1), rounding=ROUND_HALF_UP))


@dataclass(frozen=True)
class LineTotals:
    subtotal_minor: int
    tax_minor: int


def line_totals(
    quantity: Decimal, unit_price_minor: int, tax_rate: Decimal
) -> LineTotals:
    subtotal = to_minor(quantity * Decimal(unit_price_minor))
    tax = to_minor(Decimal(subtotal) * tax_rate / HUNDRED)
    return LineTotals(subtotal_minor=subtotal, tax_minor=tax)


def format_money(minor: int, currency: str = "XCD") -> str:
    sign = "-" if minor < 0 else ""
    whole, cents = divmod(abs(minor), 100)
    return f"{currency} {sign}{whole:,}.{cents:02d}"


# Reminder offsets in days relative to the due date (negative = before).
REMINDER_OFFSETS: tuple[tuple[ReminderStage, int], ...] = (
    (ReminderStage.BEFORE_DUE_7, -7),
    (ReminderStage.DUE_TODAY, 0),
    (ReminderStage.OVERDUE_7, 7),
)


def due_reminder_stage(due: date, today: date, grace_days: int) -> ReminderStage | None:
    """The latest stage whose trigger day has arrived and is still within grace.

    The grace window lets a missed worker day catch up without sending a stale
    reminder for a stage the invoice has long passed.
    """
    days_after_due = (today - due).days
    for stage, offset in reversed(REMINDER_OFFSETS):
        if offset <= days_after_due <= offset + grace_days:
            return stage
    return None
