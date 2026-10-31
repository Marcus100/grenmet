"""Payroll inputs slice 1: the eleven acceptance checks, through the API.

Synthetic people and dates only. Shift dates sit in September and October
2026 so attendance is in the past.
"""

import csv
import io
import logging
import uuid
from collections.abc import Iterator, Sequence
from datetime import date
from decimal import Decimal

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.config import auth_settings
from src.auth.models import RoleAssignmentScope
from src.database import async_session_factory
from src.hr.attendance import service as attendance_service
from src.hr.attendance.schemas import AttendanceCorrectionCreate
from src.hr.models import Organisation
from src.hr.payroll import catalogue, overtime
from src.hr.payroll.models import PayItem, PayLine
from src.hr.payroll.rules import ShiftFacts
from src.hr.roster.models import PublicHoliday
from src.hr.workflow import service as workflow_service
from src.hr.workflow.models import WorkflowAction
from src.hr.workflow.schemas import WorkflowActionRequest
from tests.factories import make_user
from tests.hr.payroll_setup import (
    API,
    approval_setup,
    calendar_and_period,
    departments,
    employee_in,
    headers_for,
    lines,
    payroll_user,
    quantities,
    worked_shift,
)

SEPTEMBER = date(2026, 9, 1)
OCTOBER = date(2026, 10, 1)


@pytest.fixture
def totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


class HoursOverEight:
    """Stand-in for the #380 band engine: everything past 8 hours is one band."""

    available = True

    async def band_hours(
        self,
        session: AsyncSession,
        *,
        organisation_id: str,
        shifts: Sequence[ShiftFacts],
    ) -> overtime.BandHours:
        del session, organisation_id
        return {
            shift.attendance_id: {"1.5": max(shift.hours() - Decimal(8), Decimal(0))}
            for shift in shifts
        }


@pytest.fixture
def band_engine() -> Iterator[None]:
    previous = overtime.install(HoursOverEight())
    yield
    overtime.install(previous)


async def _superuser_headers(db: AsyncSession) -> dict[str, str]:
    return await headers_for(db, await make_user(db, superuser=True))


async def _compute(
    client: httpx.AsyncClient, headers: dict[str, str], period_id: str
) -> dict[str, object]:
    response = await client.post(
        f"{API}/periods/{period_id}/computation", headers=headers
    )
    assert response.status_code == 200, response.text
    detail: dict[str, object] = response.json()
    return detail


async def _shift_worker(
    client: httpx.AsyncClient, headers: dict[str, str], user_id: uuid.UUID
) -> None:
    response = await client.put(
        f"{API}/profiles/{user_id}",
        headers=headers,
        json={"organisation_id": "gaa", "shift_worker": True},
    )
    assert response.status_code == 200, response.text
    assert response.json()["effective_shift_worker"] is True


# 1 ─ 12 h approved shift: 8 base + 4 band hours + 1 meal
@pytest.mark.usefixtures("band_engine")
async def test_twelve_hour_shift_gives_base_band_and_meal(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await _superuser_headers(db_async)
    await _shift_worker(async_client, admin, employee.id)
    await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 8),
        arrive="2026-09-08T07:00:00-04:00",
        depart="2026-09-08T19:00:00-04:00",
        break_minutes=60,
    )
    _, period_id = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    await _compute(async_client, admin, period_id)
    totals = quantities(await lines(async_client, admin, period_id))
    assert totals["BASE"] == 8
    assert totals["OT_TIME_AND_HALF"] == 4
    assert totals["MEAL"] == 1
    assert "SHIFT_PREMIUM" not in totals  # 07:00-19:00 is outside 21:00-06:00


async def test_without_the_band_engine_no_overtime_is_computed(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await _superuser_headers(db_async)
    await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 8),
        arrive="2026-09-08T07:00:00-04:00",
        depart="2026-09-08T19:00:00-04:00",
    )
    _, period_id = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    detail = await _compute(async_client, admin, period_id)
    assert detail["overtime_bands_available"] is False
    totals = quantities(await lines(async_client, admin, period_id))
    assert totals["BASE"] == 8
    assert not any(code.startswith("OT_") for code in totals)
    # Until #380 lands, a preparer enters band hours by hand with a reason.
    items = (await async_client.get(f"{API}/items", headers=admin)).json()["data"]
    band = next(i for i in items if i["code"] == "OT_TIME_AND_HALF")
    assert band["accepts_manual_lines"] is True
    manual = await async_client.post(
        f"{API}/periods/{period_id}/lines",
        headers=admin,
        json={
            "user_id": str(employee.id),
            "pay_item_id": band["id"],
            "quantity": "4",
            "reason": "Overtime approved on paper form",
            "work_date": "2026-09-08",
        },
    )
    assert manual.status_code == 201, manual.text
    assert manual.json()["line_kind"] == "MANUAL"


# 2 ─ non-shift meal at 18:31, not at 18:29
async def test_non_shift_meal_starts_after_eighteen_thirty(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await _superuser_headers(db_async)
    late = await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 9),
        arrive="2026-09-09T08:00:00-04:00",
        depart="2026-09-09T18:31:00-04:00",
    )
    early = await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 10),
        arrive="2026-09-10T08:00:00-04:00",
        depart="2026-09-10T18:29:00-04:00",
    )
    _, period_id = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    await _compute(async_client, admin, period_id)
    meals = [
        row
        for row in await lines(async_client, admin, period_id)
        if row["pay_item_code"] == "MEAL"
    ]
    assert [row["source_id"] for row in meals] == [str(late.id)]
    assert str(early.id) not in {row["source_id"] for row in meals}


# 3 ─ 20:00-04:00 gives 7 shift-premium hours
async def test_night_shift_premium_window(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await _superuser_headers(db_async)
    await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 11),
        arrive="2026-09-11T20:00:00-04:00",
        depart="2026-09-12T04:00:00-04:00",
    )
    _, period_id = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    await _compute(async_client, admin, period_id)
    totals = quantities(await lines(async_client, admin, period_id))
    assert totals["SHIFT_PREMIUM"] == 7
    assert totals["BASE"] == 8


async def test_public_holiday_hours_from_approved_attendance(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin_user = await make_user(db_async, superuser=True)
    admin = await headers_for(db_async, admin_user)
    db_async.add(
        PublicHoliday(
            name="Synthetic holiday",
            holiday_date=date(2026, 9, 30),
            created_by_user_id=admin_user.id,
        )
    )
    await db_async.commit()
    await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 30),
        arrive="2026-09-30T08:00:00-04:00",
        depart="2026-09-30T16:00:00-04:00",
    )
    _, period_id = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    await _compute(async_client, admin, period_id)
    totals = quantities(await lines(async_client, admin, period_id))
    assert totals == {"BASE": 8, "PUBLIC_HOLIDAY": 8}


# 4 ─ unapproved attendance gives nothing
async def test_unapproved_attendance_gives_no_lines(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await _superuser_headers(db_async)
    await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 14),
        arrive="2026-09-14T08:00:00-04:00",
        depart="2026-09-14T16:00:00-04:00",
        approve=False,
    )
    await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 15),
        arrive="2026-09-15T08:00:00-04:00",
        depart="2026-09-15T16:00:00-04:00",
        submit=False,
    )
    _, period_id = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    detail = await _compute(async_client, admin, period_id)
    assert detail["line_count"] == 0
    assert await lines(async_client, admin, period_id) == []


# 5 ─ recomputing changes nothing
async def test_recompute_is_idempotent(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await _superuser_headers(db_async)
    await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 16),
        arrive="2026-09-16T20:00:00-04:00",
        depart="2026-09-17T04:00:00-04:00",
    )
    _, period_id = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    await _compute(async_client, admin, period_id)
    first = await lines(async_client, admin, period_id)
    await _compute(async_client, admin, period_id)
    second = await lines(async_client, admin, period_id)
    assert first == second
    # Base, shift premium, and a meal: a non-shift worker departing after 18:30.
    assert quantities(first) == {"BASE": 8, "SHIFT_PREMIUM": 7, "MEAL": 1}
    computations = (
        await db_async.execute(
            select(AuditEntry).where(
                AuditEntry.entity_id == period_id,
                AuditEntry.record_type == "pay_period_computation",
            )
        )
    ).all()
    assert len(computations) == 1  # the second run changed no line


async def _submit_and_approve(
    client: httpx.AsyncClient,
    db: AsyncSession,
    period_id: str,
    preparer_headers: dict[str, str],
    accounts_id: str,
) -> None:
    submitted = await client.post(
        f"{API}/periods/{period_id}/submission", headers=preparer_headers
    )
    assert submitted.status_code == 200, submitted.text
    assert submitted.json()["period"]["status"] == "IN_REVIEW"
    del accounts_id
    approver = await make_user(db, superuser=True)
    approved = await client.post(
        f"{API}/periods/{period_id}/approval",
        headers=await headers_for(db, approver, mfa=True),
        json={},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["period"]["status"] == "APPROVED"


# 6 ─ a correction after approval: reversal and replacement in the next period
@pytest.mark.usefixtures("totp_keys")
async def test_correction_after_approval_adjusts_the_next_period(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    ops, _, accounts = await departments(db_async)
    approver_role = await approval_setup(db_async, accounts.id)
    employee = await employee_in(db_async, ops)
    preparer = await payroll_user(
        db_async,
        "hr.payroll.prepare",
        "hr.payroll.read.department",
        department_id=ops.id,
    )
    preparer_headers = await headers_for(db_async, preparer)
    record = await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 21),
        arrive="2026-09-21T20:00:00-04:00",
        depart="2026-09-22T04:00:00-04:00",
    )
    _, september = await calendar_and_period(
        async_client, preparer_headers, accounts.id, SEPTEMBER
    )
    await _compute(async_client, preparer_headers, september)
    # The approver role must be the one the PAYROLL_RUN step requires.
    from src.auth.models import Role

    role = await db_async.get(Role, approver_role)
    assert role is not None
    approver = await payroll_user(db_async, department_id=accounts.id)
    from tests.factories import assign_role

    await assign_role(db_async, user=approver, role=role, scope=RoleAssignmentScope.ALL)
    submitted = await async_client.post(
        f"{API}/periods/{september}/submission", headers=preparer_headers
    )
    assert submitted.status_code == 200, submitted.text
    approved = await async_client.post(
        f"{API}/periods/{september}/approval",
        headers=await headers_for(db_async, approver, mfa=True),
        json={"comments": "Checked against the roster"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["period"]["status"] == "APPROVED"
    before = await lines(async_client, preparer_headers, september)
    assert quantities(before) == {"BASE": 8, "SHIFT_PREMIUM": 7, "MEAL": 1}

    # Approved lines are final, even for a direct database write.
    line_id = uuid.UUID(str(before[0]["id"]))
    for statement in (
        "UPDATE hr.pay_line SET quantity = 1 WHERE id = :id",
        "DELETE FROM hr.pay_line WHERE id = :id",
    ):
        async with async_session_factory() as fresh:
            with pytest.raises(DBAPIError, match="lines are locked"):
                await fresh.execute(text(statement), {"id": line_id})

    # The employee left at 02:00, not 04:00: an approved correction.
    correction = await attendance_service.propose_correction(
        session=db_async,
        current_user=employee,
        attendance_id=record.id,
        payload=AttendanceCorrectionCreate.model_validate(
            {
                "roster_assignment_id": record.roster_assignment_id,
                "expected_revision": record.revision,
                "arrived_at": "2026-09-21T20:00:00-04:00",
                "departed_at": "2026-09-22T02:00:00-04:00",
                "break_minutes": 0,
                "reason": "Departure was recorded two hours late",
            }
        ),
    )
    supervisor = await make_user(db_async, superuser=True)
    assert correction.workflow_instance_id is not None
    await workflow_service.apply_workflow_action(
        session=db_async,
        current_user=supervisor,
        workflow_instance_id=correction.workflow_instance_id,
        action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
    )

    _, october = await calendar_and_period(
        async_client, preparer_headers, accounts.id, OCTOBER
    )
    await _compute(async_client, preparer_headers, october)
    adjustments = await lines(async_client, preparer_headers, october)
    by_kind = {
        (row["pay_item_code"], row["line_kind"]): float(str(row["quantity"]))
        for row in adjustments
    }
    assert by_kind == {
        ("BASE", "REVERSAL"): -8,
        ("BASE", "REPLACEMENT"): 6,
        ("SHIFT_PREMIUM", "REVERSAL"): -7,
        ("SHIFT_PREMIUM", "REPLACEMENT"): 5,
    }
    assert {row["run_kind"] for row in adjustments} == {"ADJUSTMENT"}
    assert {row["adjusts_period_id"] for row in adjustments} == {september}
    # September is untouched, and recomputing October adds nothing more.
    assert await lines(async_client, preparer_headers, september) == before
    await _compute(async_client, preparer_headers, october)
    assert await lines(async_client, preparer_headers, october) == adjustments


# 7 ─ the preparer cannot approve
@pytest.mark.usefixtures("totp_keys")
async def test_preparer_cannot_approve_own_period(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    ops, _, accounts = await departments(db_async)
    await approval_setup(db_async, accounts.id)
    both = await payroll_user(
        db_async,
        "hr.payroll.prepare",
        "hr.payroll.approve",
        "workflow.instance.view",
        "workflow.instance.action",
        department_id=ops.id,
    )
    headers = await headers_for(db_async, both, mfa=True)
    _, period_id = await calendar_and_period(
        async_client, headers, accounts.id, SEPTEMBER
    )
    submitted = await async_client.post(
        f"{API}/periods/{period_id}/submission", headers=headers
    )
    assert submitted.status_code == 200, submitted.text
    assert "approve" not in submitted.json()["allowed_actions"]
    assert submitted.json()["prepared_by_caller"] is True
    refused = await async_client.post(
        f"{API}/periods/{period_id}/approval", headers=headers, json={}
    )
    assert refused.status_code == 403
    # The generic workflow inbox cannot be used to bypass the payroll checks.
    instance_id = submitted.json()["period"]["workflow_instance_id"]
    generic = await async_client.post(
        f"/api/v1/hr/workflows/instances/{instance_id}/actions",
        headers=headers,
        json={"action": "APPROVE"},
    )
    assert generic.status_code == 403, generic.text
    detail = await async_client.get(f"{API}/periods/{period_id}", headers=headers)
    assert detail.json()["period"]["status"] == "IN_REVIEW"


# 8 ─ department scope, and another organisation sees 404
async def test_department_scope_and_cross_organisation_not_found(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, other, accounts = await departments(db_async)
    ops_employee = await employee_in(db_async, ops)
    other_employee = await employee_in(db_async, other)
    admin = await _superuser_headers(db_async)
    for employee, department, day in (
        (ops_employee, ops, 22),
        (other_employee, other, 23),
    ):
        await worked_shift(
            db_async,
            employee,
            department,
            day=date(2026, 9, day),
            arrive=f"2026-09-{day}T08:00:00-04:00",
            depart=f"2026-09-{day}T16:00:00-04:00",
        )
    _, period_id = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    await _compute(async_client, admin, period_id)
    assert len(await lines(async_client, admin, period_id)) == 2

    reader = await payroll_user(
        db_async,
        "hr.payroll.read.department",
        department_id=ops.id,
        scope=RoleAssignmentScope.DEPARTMENT,
        scoped_department=ops.id,
    )
    reader_headers = await headers_for(db_async, reader)
    visible = await lines(async_client, reader_headers, period_id)
    assert {row["user_id"] for row in visible} == {str(ops_employee.id)}
    asked_other = await async_client.get(
        f"{API}/periods/{period_id}/lines?department_id={other.id}",
        headers=reader_headers,
    )
    assert asked_other.json()["data"] == []
    # Reading does not let them prepare.
    refused = await async_client.post(
        f"{API}/periods/{period_id}/computation", headers=reader_headers
    )
    assert refused.status_code == 403

    db_async.add(Organisation(id="acme_pay", code="ACMEPAY", name="Synthetic Org"))
    await db_async.commit()
    outsider = await payroll_user(
        db_async,
        "hr.payroll.read.department",
        "hr.payroll.prepare",
        department_id=ops.id,
        organisation_id="acme_pay",
    )
    outsider_headers = await headers_for(db_async, outsider)
    for path in ("", "/lines"):
        response = await async_client.get(
            f"{API}/periods/{period_id}{path}", headers=outsider_headers
        )
        assert response.status_code == 404, path
    nobody = await headers_for(db_async, await make_user(db_async))
    response = await async_client.get(f"{API}/periods/{period_id}", headers=nobody)
    assert response.status_code == 404


# 9 ─ export needs MFA and is audited without personal data
@pytest.mark.usefixtures("totp_keys")
async def test_export_needs_mfa_and_is_audited_without_personal_data(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    ops, _, accounts = await departments(db_async)
    await approval_setup(db_async, accounts.id)
    employee = await employee_in(db_async, ops)
    await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 24),
        arrive="2026-09-24T08:00:00-04:00",
        depart="2026-09-24T16:00:00-04:00",
    )
    preparer = await payroll_user(db_async, "hr.payroll.prepare", department_id=ops.id)
    preparer_headers = await headers_for(db_async, preparer)
    _, period_id = await calendar_and_period(
        async_client, preparer_headers, accounts.id, SEPTEMBER
    )
    submitted = await async_client.post(
        f"{API}/periods/{period_id}/submission", headers=preparer_headers
    )
    assert submitted.status_code == 200, submitted.text
    approver = await make_user(db_async, superuser=True)
    without_mfa = await async_client.post(
        f"{API}/periods/{period_id}/approval",
        headers=await headers_for(db_async, approver),
        json={},
    )
    assert without_mfa.status_code == 403
    approved = await async_client.post(
        f"{API}/periods/{period_id}/approval",
        headers=await headers_for(db_async, approver, mfa=True),
        json={},
    )
    assert approved.status_code == 200, approved.text

    exporter = await payroll_user(db_async, "hr.payroll.export", department_id=ops.id)
    refused = await async_client.post(
        f"{API}/periods/{period_id}/export.csv",
        headers=await headers_for(db_async, exporter),
    )
    assert refused.status_code == 403
    assert "two-step" in refused.json()["detail"].lower()

    records: list[logging.LogRecord] = []

    class Collect(logging.Handler):
        def emit(self, record: logging.LogRecord) -> None:
            records.append(record)

    handler = Collect(level=logging.INFO)
    service_logger = logging.getLogger("src.hr.payroll.service")
    previous_level, previous_disabled = service_logger.level, service_logger.disabled
    # The in-process Alembic bootstrap (fileConfig) disables existing loggers.
    service_logger.disabled = False
    service_logger.setLevel(logging.INFO)
    service_logger.addHandler(handler)
    exported = await async_client.post(
        f"{API}/periods/{period_id}/export.csv",
        headers=await headers_for(db_async, exporter, mfa=True),
    )
    assert exported.status_code == 200, exported.text
    assert exported.headers["content-type"].startswith("text/csv")
    detail = await async_client.get(
        f"{API}/periods/{period_id}", headers=preparer_headers
    )
    assert detail.json()["period"]["status"] == "EXPORTED"
    assert detail.json()["period"]["export_count"] == 1

    entry = await db_async.scalar(
        select(AuditEntry).where(
            AuditEntry.entity_type == "pay_period",
            AuditEntry.entity_id == period_id,
            AuditEntry.action == "export",
        )
    )
    assert entry is not None
    assert entry.actor_user_id == exporter.id
    personal = {
        employee.email,
        employee.first_name,
        employee.last_name,
        exporter.email,
    }
    recorded = str(entry.changes)
    assert not any(value and value in recorded for value in personal)
    service_logger.removeHandler(handler)
    service_logger.setLevel(previous_level)
    service_logger.disabled = previous_disabled
    logged = " ".join(record.getMessage() + str(record.__dict__) for record in records)
    assert employee.email not in logged
    assert "Pay period exported" in logged


# 10 ─ a new organisation starts with an empty catalogue
async def test_new_organisation_catalogue_is_empty(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    db_async.add(Organisation(id="new_org", code="NEWORG", name="Synthetic New Org"))
    await db_async.commit()
    # Seeding again (as every deploy does) gives the new organisation nothing.
    await catalogue.seed_gaa_pay_items_async(db_async)
    await db_async.commit()
    admin = await _superuser_headers(db_async)
    empty = await async_client.get(
        f"{API}/items?organisation_id=new_org", headers=admin
    )
    assert empty.status_code == 200, empty.text
    assert empty.json()["data"] == []
    gaa = (
        await async_client.get(f"{API}/items?organisation_id=gaa", headers=admin)
    ).json()
    assert {item["code"] for item in gaa["data"]} == {
        seed.code for seed in catalogue.GAA_PAY_ITEMS
    }
    assert {item["rule_state"] for item in gaa["data"]} == {"PROVISIONAL"}
    assert all(item["source_reference"] for item in gaa["data"])
    stored = (await db_async.execute(select(PayItem.organisation_id))).scalars().all()
    assert set(stored) == {"gaa"}


# 11 ─ the CSV holds quantities only, with a provisional flag
@pytest.mark.usefixtures("totp_keys")
async def test_csv_has_quantities_only_with_provisional_flag(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    ops, _, accounts = await departments(db_async)
    await approval_setup(db_async, accounts.id)
    employee = await employee_in(db_async, ops)
    await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 25),
        arrive="2026-09-25T20:00:00-04:00",
        depart="2026-09-26T04:00:00-04:00",
    )
    admin_user = await make_user(db_async, superuser=True)
    admin = await headers_for(db_async, admin_user)
    _, period_id = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    items = (await async_client.get(f"{API}/items", headers=admin)).json()["data"]
    call_out = next(item for item in items if item["code"] == "CALL_OUT")
    added = await async_client.post(
        f"{API}/periods/{period_id}/lines",
        headers=admin,
        json={
            "user_id": str(employee.id),
            "pay_item_id": call_out["id"],
            "quantity": "1",
            "reason": "=HYPERLINK(evil) recalled after shift",
        },
    )
    assert added.status_code == 201, added.text
    no_reason = await async_client.post(
        f"{API}/periods/{period_id}/lines",
        headers=admin,
        json={
            "user_id": str(employee.id),
            "pay_item_id": call_out["id"],
            "quantity": "1",
            "reason": "  ",
        },
    )
    assert no_reason.status_code == 422
    await _submit_and_approve(async_client, db_async, period_id, admin, accounts.id)
    exported = await async_client.post(
        f"{API}/periods/{period_id}/export.csv",
        headers=await headers_for(db_async, admin_user, mfa=True),
    )
    assert exported.status_code == 200, exported.text
    rows = list(csv.DictReader(io.StringIO(exported.text)))
    header = exported.text.splitlines()[0].split(",")
    assert header == [
        "period_start",
        "period_end",
        "run",
        "line_kind",
        "employee_number",
        "payroll_reference",
        "department_code",
        "work_date",
        "item_code",
        "item_name",
        "unit",
        "quantity",
        "provisional",
        "source_type",
        "adjusts_period_start",
        "line_id",
    ]
    banned = ("rate", "amount", "pay_rate", "gross", "tax", "nis", "bank", "name")
    assert not any(
        word in column for column in header for word in banned if word != "name"
    )
    assert "employee_name" not in header
    assert {row["item_code"]: row["quantity"] for row in rows} == {
        "BASE": "8.00",
        "SHIFT_PREMIUM": "7.00",
        "MEAL": "1.00",
        "CALL_OUT": "1.00",
    }
    assert {row["provisional"] for row in rows} == {"yes"}
    assert employee.email not in exported.text
    assert f"{employee.first_name} {employee.last_name}" not in exported.text
    assert "=HYPERLINK" not in exported.text  # reasons are not exported at all
    # Locked: no new line and no recompute after approval.
    locked = await async_client.post(
        f"{API}/periods/{period_id}/computation", headers=admin
    )
    assert locked.status_code == 409
    count = len((await db_async.execute(select(PayLine.id))).all())
    assert count == 4


async def test_gaa_calendars_default_to_fortnightly_from_an_anchor(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await _superuser_headers(db_async)
    missing_anchor = await async_client.post(
        f"{API}/calendars",
        headers=admin,
        json={
            "organisation_id": "gaa",
            "name": "Fortnightly",
            "approval_department_id": accounts.id,
        },
    )
    assert missing_anchor.status_code == 400
    created = await async_client.post(
        f"{API}/calendars",
        headers=admin,
        json={
            "organisation_id": "gaa",
            "name": "Fortnightly",
            "approval_department_id": accounts.id,
            "anchor_date": "2026-08-30",
        },
    )
    assert created.status_code == 201, created.text
    calendar = created.json()
    assert calendar["frequency"] == "FORTNIGHTLY"
    misaligned = await async_client.post(
        f"{API}/periods",
        headers=admin,
        json={"calendar_id": calendar["id"], "start_date": "2026-09-01"},
    )
    assert misaligned.status_code == 400
    period = await async_client.post(
        f"{API}/periods",
        headers=admin,
        json={"calendar_id": calendar["id"], "start_date": "2026-09-13"},
    )
    assert period.status_code == 201, period.text
    assert period.json()["end_date"] == "2026-09-26"
    for day in (12, 14):
        await worked_shift(
            db_async,
            employee,
            ops,
            day=date(2026, 9, day),
            arrive=f"2026-09-{day}T08:00:00-04:00",
            depart=f"2026-09-{day}T16:00:00-04:00",
        )
    await _compute(async_client, admin, period.json()["id"])
    rows = await lines(async_client, admin, period.json()["id"])
    assert {row["work_date"] for row in rows} == {"2026-09-14"}  # the 12th is outside
