"""Bulk opening leave balances from a CSV export, posted through the leave ledger.

The same ledger path as the single-person balance dialog, so entries are
``OPENING`` or ``ADJUSTMENT`` exactly as there. Policy is not guessed: leave types
must be exact codes, and nothing is posted unless every row validates.
"""

import csv
import uuid
from decimal import Decimal, InvalidOperation
from io import StringIO

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.baseline.models import BaselineAudit
from src.baseline.schemas import (
    BalanceImportRequest,
    BalanceImportResult,
    BalanceImportRow,
)
from src.exceptions import AppException
from src.hr.leave import ledger
from src.hr.leave.models import LeaveType
from src.hr.models import EmploymentRecord, EmploymentStatus

MAX_ROWS = 2000
REQUIRED = ("employee_number", "leave_type", "balance")
MAX_BALANCE = Decimal(9999)
TWO_PLACES = Decimal("0.01")


def _parse(text: str) -> list[tuple[int, dict[str, str]]]:
    reader = csv.DictReader(StringIO(text.strip()))
    fields = [(name or "").strip().lower() for name in reader.fieldnames or []]
    missing = [name for name in REQUIRED if name not in fields]
    if missing:
        raise AppException(f"CSV is missing column(s): {', '.join(missing)}", 400)
    reader.fieldnames = fields
    rows = [
        (index, {key: (value or "").strip() for key, value in row.items() if key})
        for index, row in enumerate(reader, start=2)
        if any((value or "").strip() for value in row.values())
    ]
    if not rows:
        raise AppException("CSV has no data rows", 400)
    if len(rows) > MAX_ROWS:
        raise AppException(f"CSV has more than {MAX_ROWS} rows", 400)
    return rows


def _balance(raw: str) -> Decimal:
    try:
        value = Decimal(raw)
    except InvalidOperation as exc:
        raise ValueError("Balance is not a number") from exc
    if not value.is_finite() or value < 0 or value > MAX_BALANCE:
        raise ValueError("Balance must be between 0 and 9999")
    if value != value.quantize(TWO_PLACES):
        raise ValueError("Balance allows at most two decimal places")
    return value.quantize(TWO_PLACES)


async def import_opening_balances(
    session: AsyncSession, actor: User, body: BalanceImportRequest
) -> BalanceImportResult:
    if not actor.is_superuser:
        raise AppException("Administrator access required", 403)
    parsed = _parse(body.csv)
    numbers = {row["employee_number"] for _, row in parsed if row["employee_number"]}
    employments = {
        employment.employee_number: employment
        for employment in (
            await session.execute(
                select(EmploymentRecord).where(
                    EmploymentRecord.organisation_id == body.organisation_id,
                    EmploymentRecord.employee_number.in_(numbers),
                )
            )
        )
        .scalars()
        .all()
    }
    seen: set[tuple[str, str]] = set()
    results: list[BalanceImportRow] = []
    postings: list[tuple[uuid.UUID, str, Decimal]] = []
    for index, row in parsed:
        number, leave, raw = (
            row["employee_number"],
            row["leave_type"].upper(),
            row["balance"],
        )
        problem: str | None = None
        balance: Decimal | None = None
        employment = employments.get(number)
        if not number:
            problem = "Employee number is empty"
        elif employment is None:
            problem = "No employee with this number in the organisation"
        elif employment.status != EmploymentStatus.ACTIVE:
            problem = "Employee is not active"
        elif leave not in {item.value for item in LeaveType}:
            problem = "Unknown leave type; use an exact leave type code"
        elif (number, leave) in seen:
            problem = "Duplicate employee and leave type in this file"
        else:
            try:
                balance = _balance(raw)
            except ValueError as exc:
                problem = str(exc)
        seen.add((number, leave))
        results.append(
            BalanceImportRow(
                row=index,
                employee_number=number,
                leave_type=leave,
                balance=balance,
                status="ERROR" if problem else "OK",
                message=problem,
            )
        )
        if not problem and employment is not None and balance is not None:
            postings.append((employment.user_id, leave, balance))

    invalid = sum(1 for result in results if result.status == "ERROR")
    applied = body.apply and invalid == 0
    if applied:
        reason = f"Opening import: {body.source} as of {body.as_of.isoformat()}"[:200]
        for user_id, leave, balance in postings:
            await ledger.set_to(
                session,
                user_id=user_id,
                leave_type=leave,
                target=balance,
                reason=reason,
                actor_id=actor.id,
            )
            session.add(
                BaselineAudit(
                    actor_id=actor.id,
                    subject_id=user_id,
                    action="leave.balance.import",
                    details={
                        "leave_type": leave,
                        "balance": str(balance),
                        "source": body.source,
                        "as_of": body.as_of.isoformat(),
                    },
                )
            )
        await session.commit()
    return BalanceImportResult(
        applied=applied,
        total=len(results),
        valid=len(results) - invalid,
        invalid=invalid,
        rows=results,
    )
