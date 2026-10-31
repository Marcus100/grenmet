"""Gross pay (slice 2): basic salary lines, line pricing, rates and basic pay.

Pricing runs at the end of every computation while the period is OPEN, so
amounts are frozen with the lines when the period is submitted. Rates and
basic pay are dated; a line uses the rate and basic in force on its work date
(or the period's last day when it has none). Changing a rate or basic later
never touches a locked period. A retroactive basic-pay change is not adjusted
automatically: enter it as a manual correction.

Money is never logged: logs carry IDs and counts only.
"""

import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import ColumnElement, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppException, NotFoundError
from src.hr.models import EmploymentRecord

from . import access, pricing
from .models import (
    EmployeeBasicPay,
    EmployeePayProfile,
    PayBasis,
    PayCalendar,
    PayFrequency,
    PayItem,
    PayItemMethod,
    PayItemRate,
    PayLine,
    PayLineKind,
    PayPeriod,
    RateKind,
)
from .schemas import EmployeeBasicPayCreate, PayItemRateCreate

logger = logging.getLogger(__name__)

BASIC_SOURCE = "basic_pay"
#: Employment Act wage periods (secondary source): monthly-rated staff at least
#: monthly, everyone else at least fortnightly. Calendars that satisfy the
#: stricter rule for hourly-paid staff.
WAGE_PERIOD_OK = frozenset({PayFrequency.FORTNIGHTLY.value})
QUANTITY_PLACES = Decimal("0.01")


@dataclass(frozen=True)
class BasicRow:
    basic_pay_id: uuid.UUID
    user_id: uuid.UUID
    department_id: str
    pay_item_id: uuid.UUID
    quantity: Decimal
    work_date: date


def _basic(row: EmployeeBasicPay) -> pricing.BasicPayFacts:
    return pricing.BasicPayFacts(
        id=row.id,
        pay_basis=row.pay_basis,
        amount_minor=row.amount_minor,
        standard_monthly_hours=row.standard_monthly_hours,
        effective_from=row.effective_from,
        effective_to=row.effective_to,
    )


def _rate(row: PayItemRate) -> pricing.RateFacts:
    return pricing.RateFacts(
        id=row.id,
        rate_kind=row.rate_kind,
        multiplier=row.multiplier,
        amount_minor=row.amount_minor,
        guaranteed_hours=row.guaranteed_hours,
        guaranteed_multiplier=row.guaranteed_multiplier,
        effective_from=row.effective_from,
        effective_to=row.effective_to,
    )


def _overlaps(start: date, end: date) -> ColumnElement[bool]:
    return (EmployeeBasicPay.effective_from <= end) & or_(
        EmployeeBasicPay.effective_to.is_(None),
        EmployeeBasicPay.effective_to >= start,
    )


async def basic_salary_rows(
    session: AsyncSession, period: PayPeriod, calendar: PayCalendar
) -> list[BasicRow]:
    """One line per salaried basic-pay row in force during the period."""
    item_id = await session.scalar(
        select(PayItem.id).where(
            PayItem.organisation_id == period.organisation_id,
            PayItem.method == PayItemMethod.BASIC_SALARY.value,
            PayItem.is_active.is_(True),
        )
    )
    if item_id is None:
        return []
    in_calendar = (
        or_(
            EmployeePayProfile.calendar_id.is_(None),
            EmployeePayProfile.calendar_id == calendar.id,
        )
        if calendar.is_default
        else EmployeePayProfile.calendar_id == calendar.id
    )
    rows = (
        await session.execute(
            select(EmployeeBasicPay, EmploymentRecord.department_id)
            .join(
                EmploymentRecord, EmploymentRecord.user_id == EmployeeBasicPay.user_id
            )
            .outerjoin(
                EmployeePayProfile,
                EmployeePayProfile.user_id == EmployeeBasicPay.user_id,
            )
            .where(
                EmployeeBasicPay.organisation_id == period.organisation_id,
                EmploymentRecord.organisation_id == period.organisation_id,
                EmployeeBasicPay.pay_basis == PayBasis.SALARIED.value,
                _overlaps(period.start_date, period.end_date),
                in_calendar,
            )
        )
    ).all()
    result = []
    for basic, department_id in rows:
        fraction = pricing.month_fraction(
            _basic(basic), period.start_date, period.end_date
        )
        if fraction <= 0:
            continue
        result.append(
            BasicRow(
                basic_pay_id=basic.id,
                user_id=basic.user_id,
                department_id=department_id,
                pay_item_id=item_id,
                quantity=fraction.quantize(QUANTITY_PLACES),
                work_date=max(period.start_date, basic.effective_from),
            )
        )
    return result


async def price_period(session: AsyncSession, period: PayPeriod) -> int:
    """Set the amount columns of every line in this period; returns rows changed."""
    rates_by_item: dict[uuid.UUID, list[PayItemRate]] = defaultdict(list)
    for rate in (
        await session.execute(
            select(PayItemRate).where(
                PayItemRate.organisation_id == period.organisation_id
            )
        )
    ).scalars():
        rates_by_item[rate.pay_item_id].append(rate)
    lines = list(
        (
            await session.execute(
                select(PayLine, PayItem.method)
                .join(PayItem, PayItem.id == PayLine.pay_item_id)
                .where(PayLine.period_id == period.id)
            )
        ).all()
    )
    users = {line.user_id for line, _ in lines}
    basics_by_user: dict[uuid.UUID, list[EmployeeBasicPay]] = defaultdict(list)
    if users:
        for basic in (
            await session.execute(
                select(EmployeeBasicPay).where(EmployeeBasicPay.user_id.in_(users))
            )
        ).scalars():
            basics_by_user[basic.user_id].append(basic)
    if not rates_by_item and not basics_by_user:
        return 0  # nothing priced in this organisation: slice 1 behaviour
    reversed_amounts = await _recorded_amounts(session, period, lines)
    changed = 0
    for line, method in lines:
        day = line.work_date or period.end_date
        rate_row = next(
            (
                r
                for r in rates_by_item.get(line.pay_item_id, [])
                if _rate(r).covers(day)
            ),
            None,
        )
        basic_row = next(
            (b for b in basics_by_user.get(line.user_id, []) if _basic(b).covers(day)),
            None,
        )
        if line.line_kind == PayLineKind.REVERSAL:
            price = pricing.Price(
                reversed_amounts.get((line.source_id, line.pay_item_id))
            )
            rate_id = basic_id = None
        elif method == PayItemMethod.BASIC_SALARY:
            own_basic = next(
                (
                    b
                    for b in basics_by_user.get(line.user_id, [])
                    if b.id == line.source_id
                ),
                None,
            )
            price = (
                pricing.Price(
                    pricing.basic_salary_minor(
                        _basic(own_basic),
                        pricing.month_fraction(
                            _basic(own_basic), period.start_date, period.end_date
                        ),
                    )
                )
                if own_basic
                else pricing.UNPRICED
            )
            rate_id, basic_id = None, own_basic.id if own_basic else None
        else:
            price = pricing.price_line(
                quantity=line.quantity,
                method=method,
                rate=_rate(rate_row) if rate_row else None,
                basic=_basic(basic_row) if basic_row else None,
            )
            rate_id = (
                rate_row.id if rate_row and price.amount_minor is not None else None
            )
            basic_id = (
                basic_row.id if basic_row and price.hourly_rate is not None else None
            )
        values = {
            "amount_minor": price.amount_minor,
            "hourly_rate": price.hourly_rate,
            "multiplier": price.multiplier,
            "fixed_amount_minor": price.fixed_amount_minor,
            "pay_item_rate_id": rate_id,
            "basic_pay_id": basic_id,
        }
        if any(getattr(line, key) != value for key, value in values.items()):
            await session.execute(
                update(PayLine).where(PayLine.id == line.id).values(**values)
            )
            changed += 1
    return changed


async def _recorded_amounts(
    session: AsyncSession, period: PayPeriod, lines: list[Any]
) -> dict[tuple[uuid.UUID | None, uuid.UUID], int | None]:
    """Net recorded amount, outside this period, of each reversed source."""
    keys = {
        (line.source_id, line.pay_item_id)
        for line, _ in lines
        if line.line_kind == PayLineKind.REVERSAL and line.source_id
    }
    if not keys:
        return {}
    rows = (
        await session.execute(
            select(
                PayLine.source_id,
                PayLine.pay_item_id,
                func.sum(PayLine.amount_minor),
                func.count(PayLine.id) - func.count(PayLine.amount_minor),
            )
            .where(
                PayLine.period_id != period.id,
                PayLine.source_id.in_({key[0] for key in keys}),
            )
            .group_by(PayLine.source_id, PayLine.pay_item_id)
        )
    ).all()
    # A reversal is priced only when everything it reverses was priced.
    return {
        (source_id, item_id): (
            -int(total) if total is not None and not unpriced else None
        )
        for source_id, item_id, total, unpriced in rows
        if (source_id, item_id) in keys
    }


# ── Reading amounts ────────────────────────────────────────────────────────────


async def list_amounts(
    session: AsyncSession, actor: User, period_id: uuid.UUID
) -> dict[str, object]:
    from .service import _line_columns

    period, _ = await access.load_period(session, actor, period_id)
    await access.require_organisation_wide(
        session, actor, period.organisation_id, access.READ_AMOUNTS
    )
    rows = [
        dict(row._mapping)
        for row in (
            await session.execute(
                _line_columns()
                .add_columns(
                    PayLine.amount_minor,
                    PayLine.hourly_rate,
                    PayLine.multiplier,
                    PayLine.fixed_amount_minor,
                )
                .where(PayLine.period_id == period.id)
                .order_by(
                    PayLine.user_id, PayLine.work_date.nulls_last(), PayLine.created_at
                )
            )
        ).all()
    ]
    employees: dict[uuid.UUID, dict[str, object]] = {}
    for row in rows:
        entry = employees.setdefault(
            row["user_id"],
            {
                "user_id": row["user_id"],
                "employee_name": row["employee_name"],
                "employee_number": row["employee_number"],
                "gross_minor": 0,
                "unpriced_line_count": 0,
            },
        )
        if row["amount_minor"] is None:
            entry["unpriced_line_count"] = int(entry["unpriced_line_count"]) + 1  # type: ignore[call-overload]
        else:
            entry["gross_minor"] = int(entry["gross_minor"]) + row["amount_minor"]  # type: ignore[call-overload]
    logger.info(
        "Payroll amounts read",
        extra={"period_id": str(period.id), "actor_id": str(actor.id)},
    )
    return {
        "period_id": period.id,
        "currency": "XCD",
        "lines": rows,
        "employees": list(employees.values()),
        "gross_minor": sum(int(e["gross_minor"]) for e in employees.values()),  # type: ignore[call-overload]
    }


# ── Rates and basic pay ────────────────────────────────────────────────────────


async def _require_reader(
    session: AsyncSession, actor: User, organisation_id: str
) -> None:
    try:
        await access.require_organisation_wide(
            session, actor, organisation_id, access.READ_AMOUNTS
        )
    except AppException:
        await access.require_organisation_wide(
            session, actor, organisation_id, access.RATES_MANAGE
        )


async def list_rates(
    session: AsyncSession, actor: User, organisation_id: str
) -> list[PayItemRate]:
    await access.require_visible(session, actor, organisation_id)
    await _require_reader(session, actor, organisation_id)
    return list(
        (
            await session.execute(
                select(PayItemRate)
                .where(PayItemRate.organisation_id == organisation_id)
                .order_by(PayItemRate.pay_item_id, PayItemRate.effective_from)
            )
        )
        .scalars()
        .all()
    )


async def create_rate(
    session: AsyncSession, actor: User, payload: PayItemRateCreate, *, token: str
) -> PayItemRate:
    item = await session.get(PayItem, payload.pay_item_id)
    if item is None:
        raise NotFoundError("Pay item not found")
    await access.require_visible(session, actor, item.organisation_id)
    await access.require_organisation_wide(
        session, actor, item.organisation_id, access.RATES_MANAGE
    )
    await access.require_mfa(session, actor, token)
    if payload.rate_kind == RateKind.HOURLY_MULTIPLIER and payload.multiplier is None:
        raise AppException("A multiplier rate needs a multiplier", 400)
    if payload.rate_kind == RateKind.FIXED_AMOUNT and payload.amount_minor is None:
        raise AppException("A fixed rate needs an amount", 400)
    await _close_open_ended(
        session,
        PayItemRate,
        PayItemRate.pay_item_id == item.id,
        payload.effective_from,
        payload.effective_to,
    )
    rate = PayItemRate(
        pay_item_id=item.id,
        organisation_id=item.organisation_id,
        rate_kind=payload.rate_kind.value,
        multiplier=payload.multiplier,
        amount_minor=payload.amount_minor,
        guaranteed_hours=payload.guaranteed_hours,
        guaranteed_multiplier=payload.guaranteed_multiplier,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        rule_state=payload.rule_state.value,
        source_reference=payload.source_reference,
        created_by_user_id=actor.id,
    )
    session.add(rate)
    await session.commit()
    await session.refresh(rate)
    logger.info("Pay item rate created", extra={"rate_id": str(rate.id)})
    return rate


async def _close_open_ended(
    session: AsyncSession,
    model: Any,
    scope: Any,
    start: date,
    end: date | None,
) -> None:
    """End an open-ended earlier row the day before; refuse any other overlap."""
    rows = list(
        (
            await session.execute(
                select(model)
                .where(
                    scope,
                    model.effective_from <= (end or date.max),
                    or_(model.effective_to.is_(None), model.effective_to >= start),
                )
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    for row in rows:
        if row.effective_to is None and row.effective_from < start:
            row.effective_to = start - timedelta(days=1)
        else:
            raise AppException(
                "These dates overlap an existing entry; end it or choose other dates",
                409,
            )


async def list_basic_pay(
    session: AsyncSession, actor: User, organisation_id: str, user_id: uuid.UUID | None
) -> list[tuple[EmployeeBasicPay, str]]:
    await access.require_visible(session, actor, organisation_id)
    await _require_reader(session, actor, organisation_id)
    statement = (
        select(EmployeeBasicPay, func.concat(User.first_name, " ", User.last_name))
        .join(User, User.id == EmployeeBasicPay.user_id)
        .where(EmployeeBasicPay.organisation_id == organisation_id)
        .order_by(User.last_name, User.first_name, EmployeeBasicPay.effective_from)
    )
    if user_id is not None:
        statement = statement.where(EmployeeBasicPay.user_id == user_id)
    return [(row[0], row[1]) for row in (await session.execute(statement)).all()]


async def create_basic_pay(
    session: AsyncSession, actor: User, payload: EmployeeBasicPayCreate, *, token: str
) -> EmployeeBasicPay:
    await access.require_visible(session, actor, payload.organisation_id)
    await access.require_organisation_wide(
        session, actor, payload.organisation_id, access.RATES_MANAGE
    )
    await access.require_mfa(session, actor, token)
    employment = await session.scalar(
        select(EmploymentRecord).where(
            EmploymentRecord.user_id == payload.user_id,
            EmploymentRecord.organisation_id == payload.organisation_id,
        )
    )
    if employment is None:
        raise NotFoundError("Employee not found in this organisation")
    if actor.id == payload.user_id and not actor.is_superuser:
        raise AppException("You cannot set your own basic pay", 403)
    reason = payload.reason
    if payload.pay_basis == PayBasis.HOURLY:
        frequency = await calendar_frequency(
            session, payload.organisation_id, payload.user_id
        )
        if frequency is not None and frequency not in WAGE_PERIOD_OK:
            if not payload.calendar_override_reason:
                raise AppException(
                    "Hourly-paid staff must be paid at least fortnightly, and this "
                    "person's pay calendar is monthly. Move them to a fortnightly "
                    "calendar, or give an override reason.",
                    409,
                )
            reason = f"Calendar override: {payload.calendar_override_reason}" + (
                f" | {reason}" if reason else ""
            )
    await _close_open_ended(
        session,
        EmployeeBasicPay,
        EmployeeBasicPay.user_id == payload.user_id,
        payload.effective_from,
        payload.effective_to,
    )
    basic = EmployeeBasicPay(
        user_id=payload.user_id,
        organisation_id=payload.organisation_id,
        pay_basis=payload.pay_basis.value,
        amount_minor=payload.amount_minor,
        standard_monthly_hours=payload.standard_monthly_hours,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        reason=reason[:300] if reason else None,
        created_by_user_id=actor.id,
    )
    session.add(basic)
    await session.commit()
    await session.refresh(basic)
    logger.info("Basic pay recorded", extra={"basic_pay_id": str(basic.id)})
    return basic


async def calendar_frequency(
    session: AsyncSession, organisation_id: str, user_id: uuid.UUID
) -> str | None:
    """The frequency of the calendar a person is paid on (own, else default)."""
    profile = await session.get(EmployeePayProfile, user_id)
    if profile is not None and profile.calendar_id is not None:
        calendar = await session.get(PayCalendar, profile.calendar_id)
    else:
        calendar = await session.scalar(
            select(PayCalendar).where(
                PayCalendar.organisation_id == organisation_id,
                PayCalendar.is_default.is_(True),
            )
        )
    return calendar.frequency if calendar else None


async def current_basis(
    session: AsyncSession, user_id: uuid.UUID, on: date
) -> str | None:
    basis: str | None = await session.scalar(
        select(EmployeeBasicPay.pay_basis)
        .where(EmployeeBasicPay.user_id == user_id, _overlaps(on, on))
        .order_by(EmployeeBasicPay.effective_from.desc())
        .limit(1)
    )
    return basis
