"""Payslips, bank-transfer and GL journal files (slice 4).

Approving a period for issue creates one itemised payslip per paid employee
in the same transaction: an itemised statement of gross pay, each deduction
and net pay is required at or before each payment (Employment Act ss. 47-48,
secondary source), so payslips are never optional for a run that pays staff.

Each payslip is a frozen JSON snapshot plus the SHA-256 of its canonical JSON;
the PDF is rendered from the snapshot by WeasyPrint and the hash is checked
first. Bank account numbers are not stored anywhere (no field-encryption
helper exists for them), so the bank file carries a placeholder column.
"""

import csv
import hashlib
import io
import json
import logging
import uuid
from collections import defaultdict
from decimal import Decimal
from html import escape
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.billing.calc import format_money
from src.exceptions import AppException, NotFoundError
from src.hr.models import Department, EmploymentRecord, Organisation

from . import access
from .export import _text
from .models import (
    DeductionCategory,
    EmployeePayProfile,
    PayItem,
    PayLine,
    PayPeriod,
    PayrollExportSetting,
    Payslip,
)

logger = logging.getLogger(__name__)

READ_SELF = access.READ_SELF
BANK_ACCOUNT_PLACEHOLDER = "NOT STORED"
BANK_COLUMNS = {
    "employee_number": "Employee number",
    "payroll_reference": "Payroll reference",
    "employee_name": "Employee name",
    "bank_account": "Bank account",
    "net_amount": "Net amount",
    "net_minor": "Net (cents)",
    "currency": "Currency",
    "reference": "Payment reference",
}
DEFAULT_BANK_COLUMNS = [
    "employee_number",
    "employee_name",
    "bank_account",
    "net_amount",
    "currency",
    "reference",
]
GL_KEYS = (
    "GROSS_PAY_EXPENSE",
    "EMPLOYER_CONTRIBUTION_EXPENSE",
    "NET_PAY_PAYABLE",
    "INCOME_TAX_PAYABLE",
    "SOCIAL_INSURANCE_PAYABLE",
    "OTHER_DEDUCTIONS_PAYABLE",
)


def canonical(snapshot: dict[str, Any]) -> str:
    return json.dumps(snapshot, sort_keys=True, separators=(",", ":"), default=str)


def digest(snapshot: dict[str, Any]) -> str:
    return hashlib.sha256(canonical(snapshot).encode("utf-8")).hexdigest()


async def issue(session: AsyncSession, period: PayPeriod, actor: User) -> int:
    """Create every payslip for an issue-approved period; returns the count."""
    from .deductions import summary_for
    from .service import employee_name

    summary = await summary_for(session, period, employee_name)
    organisation = await session.get(Organisation, period.organisation_id)
    earnings = await _earnings(session, period)
    people = await _people(session, [row["user_id"] for row in summary["employees"]])
    count = 0
    for row in summary["employees"]:
        user_id = row["user_id"]
        person = people.get(user_id, {})
        snapshot = {
            "version": 1,
            "organisation": organisation.name
            if organisation
            else period.organisation_id,
            "period_start": period.start_date.isoformat(),
            "period_end": period.end_date.isoformat(),
            "currency": summary["currency"],
            "employee_name": row["employee_name"],
            "employee_number": person.get("employee_number"),
            "payroll_reference": person.get("payroll_reference"),
            "department": person.get("department"),
            "earnings": earnings.get(user_id, []),
            "gross_minor": row["gross_minor"],
            "deductions": [
                {k: d[k] for k in ("category", "code", "name", "employee_minor")}
                for d in row["deductions"]
                if d["employee_minor"]
            ],
            "employer_contributions": [
                {k: d[k] for k in ("category", "code", "name", "employer_minor")}
                for d in row["deductions"]
                if d["employer_minor"]
            ],
            "employee_deductions_minor": row["employee_deductions_minor"],
            "net_minor": row["net_minor"],
            "issued_on": period.issue_approved_at.date().isoformat()
            if period.issue_approved_at
            else None,
        }
        session.add(
            Payslip(
                period_id=period.id,
                user_id=user_id,
                organisation_id=period.organisation_id,
                snapshot=snapshot,
                sha256=digest(snapshot),
                net_minor=row["net_minor"],
                issued_by_user_id=actor.id,
            )
        )
        count += 1
    await session.flush()
    logger.info("Payslips issued", extra={"period_id": str(period.id), "count": count})
    return count


async def _earnings(
    session: AsyncSession, period: PayPeriod
) -> dict[uuid.UUID, list[dict[str, Any]]]:
    rows = (
        await session.execute(
            select(
                PayLine.user_id,
                PayItem.code,
                PayItem.name,
                PayItem.unit,
                func.sum(PayLine.quantity),
                func.sum(PayLine.amount_minor),
            )
            .join(PayItem, PayItem.id == PayLine.pay_item_id)
            .where(PayLine.period_id == period.id, PayLine.amount_minor.is_not(None))
            .group_by(
                PayLine.user_id,
                PayItem.code,
                PayItem.name,
                PayItem.unit,
                PayItem.sort_order,
            )
            .order_by(PayLine.user_id, PayItem.sort_order)
        )
    ).all()
    result: dict[uuid.UUID, list[dict[str, Any]]] = defaultdict(list)
    for user_id, code, name, unit, quantity, amount in rows:
        if amount:
            result[user_id].append(
                {
                    "code": code,
                    "name": name,
                    "unit": unit,
                    "quantity": str(Decimal(quantity).quantize(Decimal("0.01"))),
                    "amount_minor": int(amount),
                }
            )
    return result


async def _people(
    session: AsyncSession, user_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[str, str | None]]:
    if not user_ids:
        return {}
    rows = (
        await session.execute(
            select(
                EmploymentRecord.user_id,
                EmploymentRecord.employee_number,
                Department.name,
                EmployeePayProfile.payroll_reference,
            )
            .join(Department, Department.id == EmploymentRecord.department_id)
            .outerjoin(
                EmployeePayProfile,
                EmployeePayProfile.user_id == EmploymentRecord.user_id,
            )
            .where(EmploymentRecord.user_id.in_(user_ids))
        )
    ).all()
    return {
        r[0]: {"employee_number": r[1], "department": r[2], "payroll_reference": r[3]}
        for r in rows
    }


# ── Reading payslips ───────────────────────────────────────────────────────────


async def my_payslips(
    session: AsyncSession, actor: User, *, token: str
) -> list[Payslip]:
    from src.auth.policy import require_permission

    require_permission(current_user=actor, permission_key=READ_SELF)
    await access.require_mfa(session, actor, token)
    return list(
        (
            await session.execute(
                select(Payslip)
                .where(Payslip.user_id == actor.id)
                .order_by(Payslip.issued_at.desc())
            )
        ).scalars()
    )


async def period_payslips(
    session: AsyncSession, actor: User, period_id: uuid.UUID, *, token: str
) -> list[Payslip]:
    period, _ = await access.load_period(session, actor, period_id)
    await access.require_organisation_wide(
        session, actor, period.organisation_id, access.READ_AMOUNTS
    )
    await access.require_mfa(session, actor, token)
    return list(
        (
            await session.execute(select(Payslip).where(Payslip.period_id == period.id))
        ).scalars()
    )


async def readable_payslip(
    session: AsyncSession, actor: User, payslip_id: uuid.UUID, *, token: str
) -> Payslip:
    """Own payslip with hr.payroll.read.self, or any with organisation-wide amounts.

    Both need a session that passed two-step verification.
    """
    from src.auth.policy import has_permission

    await access.require_mfa(session, actor, token)
    payslip = await session.get(Payslip, payslip_id)
    if payslip is None:
        raise NotFoundError("Payslip not found")
    if payslip.user_id == actor.id and has_permission(
        current_user=actor, permission_key=READ_SELF
    ):
        return payslip
    if await access.visible_departments(session, actor, payslip.organisation_id):
        try:
            await access.require_organisation_wide(
                session, actor, payslip.organisation_id, access.READ_AMOUNTS
            )
        except AppException:
            pass
        else:
            return payslip
    raise NotFoundError("Payslip not found")


def verify(payslip: Payslip) -> None:
    if digest(payslip.snapshot) != payslip.sha256:
        logger.error("Payslip hash mismatch", extra={"payslip_id": str(payslip.id)})
        raise AppException("This payslip failed its integrity check", 409)


_FONT = (Path(__file__).parents[1] / "signatures/fonts/NotoSans-Regular.ttf").as_uri()


def render_html(snapshot: dict[str, Any], sha256: str) -> str:
    currency = str(snapshot.get("currency", "XCD"))

    def money(minor: int) -> str:
        return escape(format_money(int(minor), currency))

    def rows(items: list[dict[str, Any]], key: str, *, quantity: bool) -> str:
        return (
            "".join(
                "<tr>"
                f"<td>{escape(str(item['name']))}</td>"
                + (
                    f'<td class="n">{escape(str(item["quantity"]))}</td>'
                    if quantity
                    else ""
                )
                + f'<td class="n">{money(item[key])}</td></tr>'
                for item in items
            )
            or f'<tr><td colspan="{3 if quantity else 2}">None</td></tr>'
        )

    head = escape(str(snapshot.get("organisation", "")))
    who = escape(str(snapshot.get("employee_name", "")))
    number = escape(str(snapshot.get("employee_number") or "—"))
    department = escape(str(snapshot.get("department") or "—"))
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face {{ font-family: Document; src: url('{_FONT}'); }}
    @page {{ size: A4; margin: 16mm; @bottom-center {{ content: 'SHA-256 {sha256}'; font: 7pt Document; color: #555; }} }}
    body {{ font: 10pt Document; color: #111; }}
    h1 {{ font-size: 16pt; margin: 0 0 2mm; }} h2 {{ font-size: 11pt; margin: 5mm 0 2mm; }}
    table {{ width: 100%; border-collapse: collapse; }}
    th, td {{ border-bottom: 1px solid #bbb; padding: 1.5mm 2mm; text-align: left; }}
    .n {{ text-align: right; white-space: nowrap; }}
    .total td {{ font-weight: bold; border-bottom: 2px solid #111; }}
    </style></head><body>
    <h1>Payslip</h1>
    <p>{head}<br>Pay period {escape(str(snapshot.get("period_start")))} to {escape(str(snapshot.get("period_end")))}</p>
    <p><b>{who}</b><br>Employee number {number} · {department}</p>
    <h2>Earnings</h2>
    <table><tr><th>Item</th><th class="n">Quantity</th><th class="n">Amount</th></tr>
    {rows(snapshot.get("earnings", []), "amount_minor", quantity=True)}
    <tr class="total"><td colspan="2">Gross pay</td><td class="n">{money(snapshot.get("gross_minor", 0))}</td></tr></table>
    <h2>Deductions</h2>
    <table><tr><th>Deduction</th><th class="n">Amount</th></tr>
    {rows(snapshot.get("deductions", []), "employee_minor", quantity=False)}
    <tr class="total"><td>Total deductions</td><td class="n">{money(snapshot.get("employee_deductions_minor", 0))}</td></tr></table>
    <h2>Net pay</h2>
    <table><tr class="total"><td>Net pay</td><td class="n">{money(snapshot.get("net_minor", 0))}</td></tr></table>
    <h2>Employer contributions (not deducted from your pay)</h2>
    <table>{rows(snapshot.get("employer_contributions", []), "employer_minor", quantity=False)}</table>
    </body></html>"""


def render_pdf(snapshot: dict[str, Any], sha256: str) -> bytes:
    from weasyprint import HTML

    pdf: bytes = HTML(string=render_html(snapshot, sha256)).write_pdf()
    return pdf


# ── Export settings, bank file, GL journal ─────────────────────────────────────


async def settings_for(session: AsyncSession, organisation_id: str) -> dict[str, Any]:
    row = await session.get(PayrollExportSetting, organisation_id)
    return {
        "organisation_id": organisation_id,
        "bank_columns": (
            row.bank_columns if row and row.bank_columns else DEFAULT_BANK_COLUMNS
        ),
        "gl_accounts": {
            key: (row.gl_accounts or {}).get(key, "") if row else "" for key in GL_KEYS
        },
        "available_bank_columns": list(BANK_COLUMNS),
    }


async def read_settings(
    session: AsyncSession, actor: User, organisation_id: str
) -> dict[str, Any]:
    await access.require_visible(session, actor, organisation_id)
    await access.require_organisation_wide(
        session, actor, organisation_id, access.EXPORT
    )
    return await settings_for(session, organisation_id)


async def save_settings(
    session: AsyncSession,
    actor: User,
    organisation_id: str,
    bank_columns: list[str],
    gl_accounts: dict[str, str],
    *,
    token: str,
) -> dict[str, Any]:
    await access.require_visible(session, actor, organisation_id)
    await access.require_organisation_wide(
        session, actor, organisation_id, access.RATES_MANAGE
    )
    await access.require_mfa(session, actor, token)
    unknown = [c for c in bank_columns if c not in BANK_COLUMNS] + [
        k for k in gl_accounts if k not in GL_KEYS
    ]
    if unknown:
        raise AppException(f"Unknown columns or accounts: {', '.join(unknown)}", 400)
    row = await session.get(PayrollExportSetting, organisation_id)
    if row is None:
        row = PayrollExportSetting(organisation_id=organisation_id)
        session.add(row)
    row.bank_columns = bank_columns
    row.gl_accounts = gl_accounts
    row.updated_by_user_id = actor.id
    await session.commit()
    return await settings_for(session, organisation_id)


async def _issued(
    session: AsyncSession, actor: User, period_id: uuid.UUID, token: str
) -> tuple[PayPeriod, list[Payslip]]:
    period, _ = await access.load_period(session, actor, period_id)
    await access.require_organisation_wide(
        session, actor, period.organisation_id, access.EXPORT
    )
    await access.require_mfa(session, actor, token)
    if period.issue_approved_at is None:
        raise AppException("Approve the period for issue first", 409)
    slips = list(
        (
            await session.execute(select(Payslip).where(Payslip.period_id == period.id))
        ).scalars()
    )
    if not slips:
        raise AppException("This period has no payslips", 409)
    return period, slips


async def _record_export(
    session: AsyncSession, period: PayPeriod, kind: str, rows: int
) -> None:
    await audit_service.record_change(
        session,
        entity_type="pay_period",
        entity_id=str(period.id),
        record_type=f"pay_period_{kind}",
        record_id=str(period.id),
        action="export",
        changes={"row_count": (None, rows)},
        organisation_id=period.organisation_id,
    )
    await session.commit()
    logger.info(
        "Payroll file exported",
        extra={"period_id": str(period.id), "kind": kind, "row_count": rows},
    )


async def bank_csv(
    session: AsyncSession, actor: User, period_id: uuid.UUID, *, token: str
) -> tuple[str, str]:
    period, slips = await _issued(session, actor, period_id, token)
    columns = (await settings_for(session, period.organisation_id))["bank_columns"]
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow([BANK_COLUMNS[c] for c in columns])
    reference = f"PAY {period.start_date.isoformat()}"
    for slip in sorted(
        slips, key=lambda s: str(s.snapshot.get("employee_number") or "")
    ):
        values = {
            "employee_number": _text(slip.snapshot.get("employee_number")),
            "payroll_reference": _text(slip.snapshot.get("payroll_reference")),
            "employee_name": _text(slip.snapshot.get("employee_name")),
            "bank_account": BANK_ACCOUNT_PLACEHOLDER,
            "net_amount": f"{Decimal(slip.net_minor) / 100:.2f}",
            "net_minor": str(slip.net_minor),
            "currency": _text(slip.snapshot.get("currency")),
            "reference": reference,
        }
        writer.writerow([values[c] for c in columns])
    await _record_export(session, period, "bank_file", len(slips))
    return (
        f"bank-transfer-{period.organisation_id}-{period.start_date}.csv",
        buffer.getvalue(),
    )


async def gl_csv(
    session: AsyncSession, actor: User, period_id: uuid.UUID, *, token: str
) -> tuple[str, str]:
    """Balanced journal per department: debits gross and employer costs,
    credits net pay, tax, social insurance and other deductions payable."""
    period, slips = await _issued(session, actor, period_id, token)
    accounts = (await settings_for(session, period.organisation_id))["gl_accounts"]
    totals: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))
    for slip in slips:
        snap = slip.snapshot
        department = str(snap.get("department") or "")
        t = totals[department]
        t["GROSS_PAY_EXPENSE"] += int(snap["gross_minor"])
        t["NET_PAY_PAYABLE"] += int(snap["net_minor"])
        for d in snap.get("deductions", []):
            key = {
                DeductionCategory.INCOME_TAX.value: "INCOME_TAX_PAYABLE",
                DeductionCategory.SOCIAL_INSURANCE.value: "SOCIAL_INSURANCE_PAYABLE",
            }.get(d["category"], "OTHER_DEDUCTIONS_PAYABLE")
            t[key] += int(d["employee_minor"])
        for c in snap.get("employer_contributions", []):
            t["EMPLOYER_CONTRIBUTION_EXPENSE"] += int(c["employer_minor"])
            key = (
                "SOCIAL_INSURANCE_PAYABLE"
                if c["category"] == DeductionCategory.SOCIAL_INSURANCE.value
                else "OTHER_DEDUCTIONS_PAYABLE"
            )
            t[key] += int(c["employer_minor"])
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow(
        ["date", "department", "account_key", "account", "debit", "credit", "memo"]
    )
    debit_keys = {"GROSS_PAY_EXPENSE", "EMPLOYER_CONTRIBUTION_EXPENSE"}
    count = 0
    for department in sorted(totals):
        for key in GL_KEYS:
            amount = totals[department].get(key, 0)
            if not amount:
                continue
            money = f"{Decimal(amount) / 100:.2f}"
            writer.writerow(
                [
                    period.end_date.isoformat(),
                    _text(department),
                    key,
                    _text(accounts.get(key) or f"UNMAPPED:{key}"),
                    money if key in debit_keys else "",
                    "" if key in debit_keys else money,
                    f"Payroll {period.start_date} to {period.end_date}",
                ]
            )
            count += 1
    await _record_export(session, period, "gl_journal", count)
    return (
        f"gl-journal-{period.organisation_id}-{period.start_date}.csv",
        buffer.getvalue(),
    )
