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
            if kind.requires_authorisation and not (
                enrolment.authorised_at and enrolment.employee_confirmed_at
            ):
                continue  # never before the document and the employee's confirmation
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
    """Statutory tables that were PROVISIONAL when the period was computed.

    The rule state is snapshotted onto each deduction line, so confirming or
    reopening a table later never rewrites a computed period's history:
    confirm the table, then recompute while the period is open.
    """
    del session
    return sorted(
        {
            d.code
            for d in lines
            if d.category in STATUTORY and d.source_rule_state == TableState.PROVISIONAL
        }
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
        net = int(gross) - employee_total
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
                "net_minor": max(0, net),
                "shortfall_minor": max(0, -net),
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
    period = await access.lock_period(session, actor, period_id, access.APPROVE)
    await access.require_organisation_wide(
        session, actor, period.organisation_id, access.READ_AMOUNTS
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
    await _require_issue_separation(session, actor, period, lines)
    from .service import employee_name

    summary = await summary_for(session, period, employee_name)
    short = sum(1 for e in summary["employees"] if e["shortfall_minor"])
    if short:
        raise AppException(
            f"Deductions exceed gross pay for {short} employee(s); net pay cannot be "
            "below zero. Correct the deductions first.",
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
    from . import payslips

    # Itemised payslips are required for every payment (Employment Act ss. 47-48,
    # secondary source): issuing always creates them, in the same transaction.
    await payslips.issue(session, period, actor)
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


async def _require_issue_separation(
    session: AsyncSession, actor: User, period: PayPeriod, lines: list[PayDeductionLine]
) -> None:
    """Issue approval is a further pair of eyes.

    Refused to anyone who submitted or approved the period's quantities, who
    created or confirmed a statutory table it used, or who created a rate, a
    basic-pay row or a deduction enrolment in force during the period. A
    table's confirmer must also differ from the period's submitter and approver.
    """
    from src.hr.workflow.models import WorkflowAction, WorkflowStepInstance

    from .models import EmployeeBasicPay, PayItemRate

    approvers = set(
        (
            await session.execute(
                select(WorkflowStepInstance.approver_user_id).where(
                    WorkflowStepInstance.workflow_instance_id
                    == period.workflow_instance_id,
                    WorkflowStepInstance.action == WorkflowAction.APPROVE,
                )
            )
        ).scalars()
    )
    if actor.id == period.submitted_by_user_id or actor.id in approvers:
        raise AppException(
            "Whoever prepared or approved this period's quantities cannot approve it for issue",
            403,
        )
    reviewers = approvers | {period.submitted_by_user_id}
    statutory_ids = {d.source_id for d in lines if d.category in STATUTORY}
    for model in (TaxTable, SocialInsuranceScheme):
        for created_by, confirmed_by in (
            await session.execute(
                select(model.created_by_user_id, model.confirmed_by_user_id).where(
                    model.id.in_(statutory_ids)
                )
            )
        ).all():
            if actor.id in {created_by, confirmed_by}:
                raise AppException(
                    "You created or confirmed a tax or social insurance table this "
                    "period uses, so you cannot approve it for issue",
                    403,
                )
            if confirmed_by is not None and confirmed_by in reviewers:
                raise AppException(
                    "A table this period uses was confirmed by its preparer or "
                    "approver; another person must confirm it",
                    409,
                )
    models: tuple[Any, ...] = (PayItemRate, EmployeeBasicPay, EmployeeDeduction)
    for model in models:
        mine = await session.scalar(
            select(model.id)
            .where(
                model.organisation_id == period.organisation_id,
                model.created_by_user_id == actor.id,
                model.effective_from <= period.end_date,
                or_(
                    model.effective_to.is_(None),
                    model.effective_to >= period.start_date,
                ),
            )
            .limit(1)
        )
        if mine is not None:
            raise AppException(
                "You set a rate, basic pay or deduction in force in this period, "
                "so you cannot approve it for issue",
                403,
            )


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


async def _refuse_overlap(
    session: AsyncSession,
    model: Any,
    organisation_id: str,
    code: str,
    start: date,
    end: date | None,
) -> None:
    clash = await session.scalar(
        select(model.id)
        .where(
            model.organisation_id == organisation_id,
            model.code == code,
            model.effective_from <= (end or date.max),
            or_(model.effective_to.is_(None), model.effective_to >= start),
        )
        .limit(1)
    )
    if clash is not None:
        raise AppException(
            f"A {code} entry already covers some of these dates; end it first", 409
        )


async def create_tax_table(
    session: AsyncSession, actor: User, payload: TaxTableCreate, *, token: str
) -> TaxTable:
    await _require_writer(session, actor, payload.organisation_id, token)
    if not payload.bands or payload.bands[-1].width_minor is not None:
        raise AppException("The last tax band must have no upper limit", 400)
    await _refuse_overlap(
        session,
        TaxTable,
        payload.organisation_id,
        payload.code,
        payload.effective_from,
        payload.effective_to,
    )
    table = TaxTable(
        **payload.model_dump(exclude={"bands", "method"}),
        method=payload.method.value,
        rule_state=TableState.PROVISIONAL.value,
        created_by_user_id=actor.id,
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
    await _refuse_overlap(
        session,
        SocialInsuranceScheme,
        payload.organisation_id,
        payload.code,
        payload.effective_from,
        payload.effective_to,
    )
    scheme = SocialInsuranceScheme(
        **payload.model_dump(),
        rule_state=TableState.PROVISIONAL.value,
        created_by_user_id=actor.id,
    )
    session.add(scheme)
    await session.commit()
    await session.refresh(scheme)
    return scheme


async def create_deduction_type(
    session: AsyncSession, actor: User, payload: DeductionTypeCreate, *, token: str
) -> DeductionType:
    await _require_writer(session, actor, payload.organisation_id, token)
    await _refuse_overlap(
        session,
        DeductionType,
        payload.organisation_id,
        payload.code,
        payload.effective_from,
        payload.effective_to,
    )
    kind = DeductionType(
        **payload.model_dump(exclude={"kind"}),
        kind=payload.kind.value,
        rule_state=TableState.PROVISIONAL.value,
        created_by_user_id=actor.id,
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
    await access.require_visible(session, actor, record.organisation_id)
    await access.require_organisation_wide(
        session, actor, record.organisation_id, access.TABLES_CONFIRM
    )
    await access.require_mfa(session, actor, token)
    if record.created_by_user_id == actor.id:
        raise AppException(
            "Someone other than the table's creator must confirm it", 403
        )
    previous = record.rule_state
    record.rule_state = payload.rule_state.value
    if payload.rule_state == TableState.PROVISIONAL:
        record.confirmed_by_user_id = record.confirmed_at = None
    else:
        record.confirmed_by_user_id = actor.id
        record.confirmed_at = utc_now()
    # The original source note is provenance and is never rewritten.
    record.confirmation_note = payload.note
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
    if payload.user_id == actor.id:
        raise AppException("You cannot set up your own deductions", 403)
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


async def my_deductions(session: AsyncSession, actor: User) -> list[dict[str, Any]]:
    from src.auth.policy import require_permission

    require_permission(current_user=actor, permission_key=access.READ_SELF)
    rows = (
        await session.execute(
            select(EmployeeDeduction, DeductionType.code, DeductionType.name)
            .join(
                DeductionType, DeductionType.id == EmployeeDeduction.deduction_type_id
            )
            .where(EmployeeDeduction.user_id == actor.id)
            .order_by(EmployeeDeduction.effective_from.desc())
        )
    ).all()
    return [
        {
            "id": enrolment.id,
            "deduction_code": code,
            "deduction_name": name,
            "effective_from": enrolment.effective_from,
            "effective_to": enrolment.effective_to,
            "authorisation_reference": enrolment.authorisation_reference,
            "employee_confirmed_at": enrolment.employee_confirmed_at,
        }
        for enrolment, code, name in rows
    ]


async def confirm_my_deduction(
    session: AsyncSession, actor: User, deduction_id: uuid.UUID
) -> list[dict[str, Any]]:
    """The employee confirms a deduction set up for them (hr.payroll.read.self)."""
    from src.auth.policy import require_permission

    require_permission(current_user=actor, permission_key=access.READ_SELF)
    enrolment = await session.get(EmployeeDeduction, deduction_id)
    if enrolment is None or enrolment.user_id != actor.id:
        raise NotFoundError("Deduction not found")
    if enrolment.authorisation_reference is None:
        raise AppException(
            "HR must record your signed authorisation before you confirm", 409
        )
    if enrolment.employee_confirmed_at is None:
        enrolment.employee_confirmed_at = utc_now()
        await session.commit()
    return await my_deductions(session, actor)
