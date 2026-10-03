"""Read-only leave reconciliation report. Use --require-reconciled for HR sign-off gates.

Prints one CSV row per active employee and leave type, comparing the ledger with
the legacy balance and carry-over tables. The output contains staff emails and
employee numbers: send it only to GAA HR and keep it with the controlled
balance evidence, not in the repository.
"""

import argparse
import asyncio
import csv
import sys

from src.database import async_session_factory
from src.hr.leave.reconciliation import reconcile

COLUMNS = [
    "organisation_id",
    "department_id",
    "employee_number",
    "email",
    "leave_type",
    "ledger_balance",
    "ledger_entries",
    "legacy_balance",
    "legacy_carry_over",
    "findings",
]


async def report(organisation_id: str | None) -> bool:
    async with async_session_factory() as session:
        rows = await reconcile(session, organisation_id=organisation_id)
    writer = csv.writer(sys.stdout)
    writer.writerow(COLUMNS)
    for row in rows:
        writer.writerow(
            [
                row.organisation_id,
                row.department_id,
                row.employee_number or "",
                row.email,
                row.leave_type,
                "" if row.ledger_balance is None else row.ledger_balance,
                row.ledger_entries,
                "" if row.legacy_balance is None else row.legacy_balance,
                "" if row.legacy_carry_over is None else row.legacy_carry_over,
                " ".join(f.value for f in row.findings),
            ]
        )
    unresolved = sum(not row.reconciled for row in rows)
    print(f"{len(rows)} rows, {unresolved} with findings", file=sys.stderr)
    return unresolved == 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--organisation", help="Limit to one organisation id")
    parser.add_argument("--require-reconciled", action="store_true")
    args = parser.parse_args()
    reconciled = asyncio.run(report(args.organisation))
    raise SystemExit(1 if args.require_reconciled and not reconciled else 0)
