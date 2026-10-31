"""Deductions (slice 3): income tax, social insurance and other deductions.

Computed with the period while it is OPEN, from priced lines (slice 2), and
locked with it. Each deduction line records the table it used and that
table's rule state.

HARD RULE: a period whose income tax or social insurance lines used a
PROVISIONAL table cannot be approved for issue. It can be previewed, and the
preview says "Provisional figures".

Money is never logged: logs carry IDs and counts only.
"""

import logging
import uuid
from collections import defaultdict
from dataclasses import dataclass
from datetime import date
from typing import Any

from sqlalchemy import delete, func, insert, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.exceptions import AppException, NotFoundError
from src.hr.models import EmploymentRecord
from src.utils.datetime import utc_now

from . import access, statutory
from .models import (
    LOCKED_STATUSES,
    DeductionCategory,
    DeductionType,
    EmployeeDeduction,
    PayCalendar,
    PayDeductionLine,
    PayItem,
    PayItemMethod,
    PayLine,
    PayPeriod,
    SocialInsuranceScheme,
    TableState,
    TaxBand,
    TaxTable,
)
from .schemas import (
    DeductionTypeCreate,
    EmployeeDeductionCreate,
    SocialInsuranceSchemeCreate,
    TableStateUpdate,
    TaxTableCreate,
)

logger = logging.getLogger(__name__)

STATUTORY = frozenset(
    {DeductionCategory.INCOME_TAX.value, DeductionCategory.SOCIAL_INSURANCE.value}
)
LOCKED_VALUES = frozenset(status.value for status in LOCKED_STATUSES)


def _covering(model: Any, day: date) -> Any:
    return (model.effective_from <= day) & or_(
        model.effective_to.is_(None), model.effective_to >= day
    )


@dataclass(frozen=True)
class DeductionSpec:
    user_id: uuid.UUID
    category: str
    code: str
    name: str
    split: statutory.Split
    source_id: uuid.UUID
    source_rule_state: str


async def compute(session: AsyncSession, period: PayPeriod) -> int:
    """Replace this period's deduction lines; returns rows changed."""
    org, day = period.organisation_id, period.end_date
    taxes = list(
        (
            await session.execute(
                select(TaxTable).where(
                    TaxTable.organisation_id == org, _covering(TaxTable, day)
                )
            )
        ).scalars()
    )
    schemes = list(
        (
            await session.execute(
                select(SocialInsuranceScheme).where(
                    SocialInsuranceScheme.organisation_id == org,
                    _covering(SocialInsuranceScheme, day),
                )
            )
        ).scalars()
    )
    enrolments = list(
        (
            await session.execute(
                select(EmployeeDeduction, DeductionType)
                .join(
                    DeductionType,
                    DeductionType.id == EmployeeDeduction.deduction_type_id,
                )
                .where(
                    EmployeeDeduction.organisation_id == org,
                    DeductionType.is_active.is_(True),
                    _covering(EmployeeDeduction, day),
                    _covering(DeductionType, day),
                )
            )
        ).all()
    )
    existing = {
        (line.user_id, line.code): line
        for line in (
            await session.execute(
                select(PayDeductionLine).where(PayDeductionLine.period_id == period.id)
            )
        ).scalars()
    }
    if not (taxes or schemes or enrolments or existing):
        return 0
    frequency = await session.scalar(
        select(PayCalendar.frequency).where(PayCalendar.id == period.calendar_id)
    )
    periods = statutory.periods_per_year(frequency or "MONTHLY")
    totals = (
        await session.execute(
            select(
                PayLine.user_id,
                func.coalesce(func.sum(PayLine.amount_minor), 0),
                func.coalesce(
                    func.sum(PayLine.amount_minor).filter(
                        PayItem.method == PayItemMethod.BASIC_SALARY.value
                    ),
                    0,
                ),
            )
            .join(PayItem, PayItem.id == PayLine.pay_item_id)
            .where(PayLine.period_id == period.id, PayLine.amount_minor.is_not(None))
            .group_by(PayLine.user_id)
        )
    ).all()
    bands_by_table: dict[uuid.UUID, list[statutory.Band]] = defaultdict(list)
    for band in (
        await session.execute(
            select(TaxBand)
            .where(TaxBand.tax_table_id.in_([t.id for t in taxes]))
            .order_by(TaxBand.tax_table_id, TaxBand.sort_order)
        )
    ).scalars():
        bands_by_table[band.tax_table_id].append(
            statutory.Band(width_minor=band.width_minor, rate=band.rate)
        )
    by_user: dict[uuid.UUID, list[tuple[EmployeeDeduction, DeductionType]]] = (
        defaultdict(list)
    )
    for enrolment, kind in enrolments:
        by_user[enrolment.user_id].append((enrolment, kind))

    specs: list[DeductionSpec] = []
    for user_id, gross, basic in totals:
        gross, basic = int(gross), int(basic)
        employee_social = 0
        for scheme in schemes:
            split = statutory.social_insurance(
                gross,
                statutory.insurable_ceiling(
                    frequency or "MONTHLY",
                    monthly_minor=scheme.monthly_ceiling_minor,
                    weekly_minor=scheme.weekly_ceiling_minor,
                    fortnightly_minor=scheme.fortnightly_ceiling_minor,
                ),
                scheme.employee_rate,
                scheme.employer_rate,
            )
            employee_social += split.employee_minor
            specs.append(
                DeductionSpec(
                    user_id,
                    DeductionCategory.SOCIAL_INSURANCE.value,
                    scheme.code,
                    scheme.name,
                    split,
                    scheme.id,
                    scheme.rule_state,
                )
            )
        for table in taxes:
            taxable = gross - (employee_social if table.deduct_social_insurance else 0)
            specs.append(
                DeductionSpec(
                    user_id,
                    DeductionCategory.INCOME_TAX.value,
                    table.code,
                    table.name,
                    statutory.income_tax_annualised(
                        taxable,
                        periods=periods,
                        allowance_minor=table.annual_allowance_minor,
                        bands=bands_by_table[table.id],
                    ),
                    table.id,
                    table.rule_state,
                )
            )
        for enrolment, kind in by_user.get(user_id, []):
            if kind.requires_authorisation and enrolment.authorised_at is None:
                continue  # never deducted without a recorded authorisation
            split_or_none = statutory.other_deduction(
                kind.kind,
                basic_minor=basic,
                gross_minor=gross,
                employee_rate=kind.employee_rate,
                employer_rate=kind.employer_rate,
                employee_amount_minor=enrolment.employee_amount_minor
                if enrolment.employee_amount_minor is not None
                else kind.employee_amount_minor,
                employer_amount_minor=kind.employer_amount_minor,
                premium_minor=kind.premium_minor,
                employee_share=kind.employee_share,
            )
            if split_or_none is not None:
                specs.append(
                    DeductionSpec(
                        user_id,
                        DeductionCategory.OTHER.value,
                        kind.code,
                        kind.name,
                        split_or_none,
                        kind.id,
                        kind.rule_state,
                    )
                )
    return await _sync(session, period, specs, existing)


async def _sync(
    session: AsyncSession,
    period: PayPeriod,
    specs: list[DeductionSpec],
    existing: dict[tuple[uuid.UUID, str], PayDeductionLine],
) -> int:
    wanted = {(spec.user_id, spec.code): spec for spec in specs}
    stale = [line.id for key, line in existing.items() if key not in wanted]
    changed = len(stale)
    if stale:
        await session.execute(
            delete(PayDeductionLine).where(PayDeductionLine.id.in_(stale))
        )
    inserts = []
    for key, spec in wanted.items():
        values = {
            "category": spec.category,
            "name": spec.name,
            "base_minor": spec.split.base_minor,
            "employee_minor": spec.split.employee_minor,
            "employer_minor": spec.split.employer_minor,
            "source_id": spec.source_id,
            "source_rule_state": spec.source_rule_state,
        }
        line = existing.get(key)
        if line is None:
            inserts.append(
                {
                    "id": uuid.uuid4(),
                    "period_id": period.id,
                    "user_id": spec.user_id,
                    "code": spec.code,
                    "created_at": utc_now(),
                    **values,
                }
            )
        elif any(getattr(line, k) != v for k, v in values.items()):
            await session.execute(
                update(PayDeductionLine)
                .where(PayDeductionLine.id == line.id)
                .values(**values)
            )
            changed += 1
    if inserts:
        await session.execute(insert(PayDeductionLine), inserts)
        changed += len(inserts)
    return changed


# ── Preview and issue approval ─────────────────────────────────────────────────


async def provisional_codes(
    session: AsyncSession, lines: list[PayDeductionLine]
) -> list[str]:
    """Statutory tables used by these lines that are PROVISIONAL now.

    Tables cannot be edited after creation (only their rule state changes), so a
    table confirmed after the period was computed unblocks it without changing
    any figure.
    """
    ids = {d.source_id for d in lines if d.category in STATUTORY}
    if not ids:
        return []
    states: dict[uuid.UUID, tuple[str, str]] = {}
    for model in (TaxTable, SocialInsuranceScheme):
        for row_id, code, state in (
            await session.execute(
                select(model.id, model.code, model.rule_state).where(model.id.in_(ids))
            )
        ).all():
            states[row_id] = (code, state)
    return sorted(
        {code for code, state in states.values() if state == TableState.PROVISIONAL}
    )


async def pay_summary(
    session: AsyncSession, actor: User, period_id: uuid.UUID
) -> dict[str, Any]:
    from .service import employee_name

    period, _ = await access.load_period(session, actor, period_id)
    await access.require_organisation_wide(
        session, actor, period.organisation_id, access.READ_AMOUNTS
    )
    return await summary_for(session, period, employee_name)


async def summary_for(
    session: AsyncSession, period: PayPeriod, name_of: Any
) -> dict[str, Any]:
    gross_rows = (
        await session.execute(
            select(
                PayLine.user_id,
                func.coalesce(func.sum(PayLine.amount_minor), 0),
                func.count(PayLine.id) - func.count(PayLine.amount_minor),
            )
            .where(PayLine.period_id == period.id)
            .group_by(PayLine.user_id)
        )
    ).all()
    lines = list(
        (
            await session.execute(
                select(PayDeductionLine)
                .where(PayDeductionLine.period_id == period.id)
                .order_by(PayDeductionLine.user_id, PayDeductionLine.category)
            )
        ).scalars()
    )
    by_user: dict[uuid.UUID, list[PayDeductionLine]] = defaultdict(list)
    for line in lines:
        by_user[line.user_id].append(line)
    employees = []
    for user_id, gross, unpriced in gross_rows:
        deductions = by_user.get(user_id, [])
        employee_total = sum(d.employee_minor for d in deductions)
        employees.append(
            {
                "user_id": user_id,
                "employee_name": await name_of(session, user_id),
                "gross_minor": int(gross),
                "unpriced_line_count": int(unpriced),
                "deductions": [
                    {
                        "category": d.category,
                        "code": d.code,
                        "name": d.name,
                        "base_minor": d.base_minor,
                        "employee_minor": d.employee_minor,
                        "employer_minor": d.employer_minor,
                        "rule_state": d.source_rule_state,
                    }
                    for d in deductions
                ],
                "employee_deductions_minor": employee_total,
                "employer_contributions_minor": sum(
                    d.employer_minor for d in deductions
                ),
                "net_minor": int(gross) - employee_total,
            }
        )
    blocking = await provisional_codes(session, lines)
    return {
        "period_id": period.id,
        "currency": "XCD",
        "provisional_figures": bool(blocking),
        "label": "Provisional figures" if blocking else None,
        "blocking_tables": blocking,
        "issue_approved_at": period.issue_approved_at,
        "employees": employees,
    }


async def approve_for_issue(
    session: AsyncSession, actor: User, period_id: uuid.UUID, *, token: str
) -> PayPeriod:
    period, _ = await access.load_period(session, actor, period_id, for_update=True)
    await access.require_organisation_wide(
        session, actor, period.organisation_id, access.APPROVE
    )
    await access.require_mfa(session, actor, token)
    if period.status not in LOCKED_VALUES:
        raise AppException("Approve the pay period's quantities first", 409)
    if period.issue_approved_at is not None:
        return period
    if period.submitted_by_user_id == actor.id:
        raise AppException(
            "The person who prepared this period cannot approve it for issue", 403
        )
    lines = list(
        (
            await session.execute(
                select(PayDeductionLine).where(PayDeductionLine.period_id == period.id)
            )
        ).scalars()
    )
    provisional = await provisional_codes(session, lines)
    if provisional:
        raise AppException(
            "Provisional figures: the "
            + ", ".join(provisional)
            + " table is provisional. Confirm it before approving for issue.",
            409,
        )
    if not {d.category for d in lines} >= STATUTORY:
        raise AppException(
            "No income tax or social insurance was calculated for this period", 409
        )
    unpriced = await session.scalar(
        select(func.count(PayLine.id)).where(
            PayLine.period_id == period.id, PayLine.amount_minor.is_(None)
        )
    )
    if unpriced:
        raise AppException(
            f"{unpriced} pay lines have no rate or basic pay; price them first", 409
        )
    period.issue_approved_at = period.updated_at = utc_now()
    period.issue_approved_by_user_id = actor.id
    await audit_service.record_change(
        session,
        entity_type="pay_period",
        entity_id=str(period.id),
        record_type="pay_period_issue",
        record_id=str(period.id),
        action="approve",
        changes={"issue_approved": (False, True)},
        organisation_id=period.organisation_id,
    )
    await session.commit()
    await session.refresh(period)
    logger.info("Pay period approved for issue", extra={"period_id": str(period.id)})
    return period


# ── Table management (rates.manage + MFA; reads also with read.amounts) ────────


async def _require_reader(session: AsyncSession, actor: User, org: str) -> None:
    from .gross import _require_reader as reader

    await access.require_visible(session, actor, org)
    await reader(session, actor, org)


async def _require_writer(
    session: AsyncSession, actor: User, org: str, token: str
) -> None:
    await access.require_visible(session, actor, org)
    await access.require_organisation_wide(session, actor, org, access.RATES_MANAGE)
    await access.require_mfa(session, actor, token)


async def list_tables(session: AsyncSession, actor: User, org: str) -> dict[str, Any]:
    await _require_reader(session, actor, org)
    taxes = list(
        (
            await session.execute(
                select(TaxTable)
                .where(TaxTable.organisation_id == org)
                .order_by(TaxTable.effective_from)
            )
        ).scalars()
    )
    bands = defaultdict(list)
    for band in (
        await session.execute(
            select(TaxBand)
            .where(TaxBand.tax_table_id.in_([t.id for t in taxes]))
            .order_by(TaxBand.sort_order)
        )
    ).scalars():
        bands[band.tax_table_id].append(band)
    schemes = (
        await session.execute(
            select(SocialInsuranceScheme)
            .where(SocialInsuranceScheme.organisation_id == org)
            .order_by(SocialInsuranceScheme.effective_from)
        )
    ).scalars()
    types = (
        await session.execute(
            select(DeductionType)
            .where(DeductionType.organisation_id == org)
            .order_by(DeductionType.code)
        )
    ).scalars()
    return {
        "tax_tables": [
            {**_row(t), "bands": [_row(b) for b in bands[t.id]]} for t in taxes
        ],
        "social_insurance": [_row(s) for s in schemes],
        "deduction_types": [_row(d) for d in types],
    }


def _row(record: Any) -> dict[str, Any]:
    return {c.key: getattr(record, c.key) for c in record.__table__.columns}


async def create_tax_table(
    session: AsyncSession, actor: User, payload: TaxTableCreate, *, token: str
) -> TaxTable:
    await _require_writer(session, actor, payload.organisation_id, token)
    if not payload.bands or payload.bands[-1].width_minor is not None:
        raise AppException("The last tax band must have no upper limit", 400)
    table = TaxTable(
        **payload.model_dump(exclude={"bands", "rule_state", "method"}),
        method=payload.method.value,
        rule_state=payload.rule_state.value,
    )
    session.add(table)
    await session.flush()
    session.add_all(
        TaxBand(tax_table_id=table.id, sort_order=i, **band.model_dump())
        for i, band in enumerate(payload.bands, start=1)
    )
    await session.commit()
    await session.refresh(table)
    return table


async def create_scheme(
    session: AsyncSession,
    actor: User,
    payload: SocialInsuranceSchemeCreate,
    *,
    token: str,
) -> SocialInsuranceScheme:
    await _require_writer(session, actor, payload.organisation_id, token)
    scheme = SocialInsuranceScheme(
        **payload.model_dump(exclude={"rule_state"}),
        rule_state=payload.rule_state.value,
    )
    session.add(scheme)
    await session.commit()
    await session.refresh(scheme)
    return scheme


async def create_deduction_type(
    session: AsyncSession, actor: User, payload: DeductionTypeCreate, *, token: str
) -> DeductionType:
    await _require_writer(session, actor, payload.organisation_id, token)
    kind = DeductionType(
        **payload.model_dump(exclude={"rule_state", "kind"}),
        kind=payload.kind.value,
        rule_state=payload.rule_state.value,
    )
    session.add(kind)
    await session.commit()
    await session.refresh(kind)
    return kind


async def set_table_state(
    session: AsyncSession,
    actor: User,
    kind: str,
    table_id: uuid.UUID,
    payload: TableStateUpdate,
    *,
    token: str,
) -> Any:
    model: Any = {
        "tax": TaxTable,
        "social-insurance": SocialInsuranceScheme,
        "deduction": DeductionType,
    }.get(kind)
    if model is None:
        raise NotFoundError("Unknown table kind")
    record: Any = await session.get(model, table_id)
    if record is None:
        raise NotFoundError("Table not found")
    await _require_writer(session, actor, record.organisation_id, token)
    previous = record.rule_state
    record.rule_state = payload.rule_state.value
    note = f"{payload.rule_state.value} by {actor.id} on {date.today().isoformat()}: {payload.note}"
    record.source_note = ((record.source_note or "") + " | " + note)[-500:]
    await audit_service.record_change(
        session,
        entity_type="payroll_settings",
        entity_id=record.organisation_id,
        record_type=model.__tablename__,
        record_id=str(record.id),
        action="update",
        changes={"rule_state": (previous, record.rule_state)},
        organisation_id=record.organisation_id,
    )
    await session.commit()
    await session.refresh(record)
    return record


async def list_employee_deductions(
    session: AsyncSession, actor: User, org: str, user_id: uuid.UUID | None
) -> list[EmployeeDeduction]:
    await _require_reader(session, actor, org)
    statement = select(EmployeeDeduction).where(
        EmployeeDeduction.organisation_id == org
    )
    if user_id is not None:
        statement = statement.where(EmployeeDeduction.user_id == user_id)
    return list((await session.execute(statement)).scalars())


async def create_employee_deduction(
    session: AsyncSession, actor: User, payload: EmployeeDeductionCreate, *, token: str
) -> EmployeeDeduction:
    await _require_writer(session, actor, payload.organisation_id, token)
    kind = await session.get(DeductionType, payload.deduction_type_id)
    if kind is None or kind.organisation_id != payload.organisation_id:
        raise NotFoundError("Deduction type not found")
    employment = await session.scalar(
        select(EmploymentRecord.id).where(
            EmploymentRecord.user_id == payload.user_id,
            EmploymentRecord.organisation_id == payload.organisation_id,
        )
    )
    if employment is None:
        raise NotFoundError("Employee not found in this organisation")
    enrolment = EmployeeDeduction(
        **payload.model_dump(exclude={"authorisation_reference"}),
        created_by_user_id=actor.id,
    )
    if payload.authorisation_reference:
        enrolment.authorisation_reference = payload.authorisation_reference
        enrolment.authorised_at = utc_now()
        enrolment.authorised_by_user_id = actor.id
    session.add(enrolment)
    await session.commit()
    await session.refresh(enrolment)
    return enrolment
