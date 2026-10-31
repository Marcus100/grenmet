"""Roster rules (#380): scope boundaries, legacy paths, reason hygiene, audit."""

from datetime import date, timedelta
from decimal import Decimal

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope, User
from src.config import settings
from src.exceptions import AppException, app_exception_handler
from src.hr.leave.models import LeaveRequest, LeaveType
from src.hr.leave.schemas import LeaveRequestAction
from src.hr.leave.service import action_leave_request
from src.hr.models import Department, Organisation, RequestStatus
from src.hr.roster.models import (
    RosterPeriod,
    RosterPeriodStatus,
    RosterRuleOverride,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.roster.rule_service import (
    RosterRuleWarningsError,
    list_overrides,
    read_organisation_rule_set,
    save_department_rule_set,
    update_from_rules,
    update_rule_profile,
)
from src.hr.roster.rules import DEFAULT_RULES
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterPeriodCreate,
    RosterPublishRequest,
    RosterRuleProfileUpdate,
)
from src.hr.roster.service import bulk_upsert_roster_assignments, create_roster_period
from src.hr.timesheet.models import Timesheet, TimesheetEntry, TimesheetStatus
from src.hr.timesheet.service import approve_timesheet
from tests.factories import (
    assign_role,
    make_employee,
    make_role_with_permission,
    make_user,
)

DEPT = "dept_rules_sec"
OTHER_DEPT = "dept_rules_sec2"
FOREIGN_DEPT = "dept_rules_foreign"
FOREIGN_ORG = "org_rules_foreign"
FAR = date(2027, 3, 1)


async def _seed(db: AsyncSession) -> None:
    if not await db.get(Organisation, FOREIGN_ORG):
        db.add(Organisation(id=FOREIGN_ORG, code=FOREIGN_ORG, name="Foreign"))
        await db.flush()
    for dept_id, org in (
        (DEPT, "gaa"),
        (OTHER_DEPT, "gaa"),
        (FOREIGN_DEPT, FOREIGN_ORG),
    ):
        if not await db.get(Department, dept_id):
            db.add(
                Department(organisation_id=org, code=dept_id, id=dept_id, name=dept_id)
            )
    if not await db.get(ShiftCatalog, "D"):
        db.add(
            ShiftCatalog(
                code="D",
                label="Day",
                category=ShiftCategory.WORK,
                start_time="08:00",
                end_time="16:00",
            )
        )
    await db.commit()


async def _rules_admin(
    db: AsyncSession, scope: RoleAssignmentScope, department_id: str | None = None
) -> User:
    admin = await make_user(db)
    role, _ = await make_role_with_permission(db, "roster.rules.manage", "roster.view")
    await assign_role(
        db, user=admin, role=role, scope=scope, department_id=department_id
    )
    return admin


async def _denied(call: object) -> int:
    with pytest.raises(AppException) as raised:
        await call  # type: ignore[misc]
    return raised.value.status_code


# --- scope boundaries -----------------------------------------------------------


async def test_organisation_admin_cannot_touch_another_organisation(
    db_async: AsyncSession,
) -> None:
    await _seed(db_async)
    admin = await _rules_admin(db_async, RoleAssignmentScope.ALL)
    foreign = await make_user(db_async)
    await make_employee(db_async, user=foreign, department_id=FOREIGN_DEPT)
    data = update_from_rules(DEFAULT_RULES)

    assert (
        await _denied(
            read_organisation_rule_set(
                session=db_async, current_user=admin, organisation_id=FOREIGN_ORG
            )
        )
        == 403
    )
    assert (
        await _denied(
            save_department_rule_set(
                session=db_async,
                current_user=admin,
                department_id=FOREIGN_DEPT,
                data=data,
            )
        )
        == 403
    )
    assert (
        await _denied(
            update_rule_profile(
                session=db_async,
                current_user=admin,
                user_id=foreign.id,
                data=RosterRuleProfileUpdate(union_covered=False),
            )
        )
        == 403
    )
    assert (
        await _denied(
            save_department_rule_set(
                session=db_async,
                current_user=admin,
                department_id="dept_does_not_exist",
                data=data,
            )
        )
        == 404
    )


async def test_department_admin_cannot_act_on_another_department(
    db_async: AsyncSession,
) -> None:
    await _seed(db_async)
    admin = await _rules_admin(db_async, RoleAssignmentScope.DEPARTMENT, DEPT)
    elsewhere = await make_user(db_async)
    await make_employee(db_async, user=elsewhere, department_id=OTHER_DEPT)

    saved = await save_department_rule_set(
        session=db_async,
        current_user=admin,
        department_id=DEPT,
        data=update_from_rules(DEFAULT_RULES),
    )
    assert saved.department_id == DEPT
    assert (
        await _denied(
            save_department_rule_set(
                session=db_async,
                current_user=admin,
                department_id=OTHER_DEPT,
                data=update_from_rules(DEFAULT_RULES),
            )
        )
        == 403
    )
    assert (
        await _denied(
            update_rule_profile(
                session=db_async,
                current_user=admin,
                user_id=elsewhere.id,
                data=RosterRuleProfileUpdate(union_covered=False),
            )
        )
        == 403
    )
    assert (
        await _denied(
            list_overrides(
                session=db_async,
                current_user=admin,
                department_id=OTHER_DEPT,
                limit=10,
            )
        )
        == 403
    )


async def test_nobody_changes_their_own_coverage(db_async: AsyncSession) -> None:
    await _seed(db_async)
    admin = await _rules_admin(db_async, RoleAssignmentScope.ALL)
    await make_employee(db_async, user=admin, department_id=DEPT)
    assert (
        await _denied(
            update_rule_profile(
                session=db_async,
                current_user=admin,
                user_id=admin.id,
                data=RosterRuleProfileUpdate(union_covered=False),
            )
        )
        == 403
    )


# --- legacy paths -----------------------------------------------------------------


async def _published_roster(
    db: AsyncSession, manager: User, staff: User, cells: dict[date, str]
) -> RosterPeriod:
    period = await create_roster_period(
        session=db,
        current_user=manager,
        period_in=RosterPeriodCreate(
            department_id=DEPT, period_start=FAR, period_end=FAR + timedelta(27)
        ),
    )
    await bulk_upsert_roster_assignments(
        session=db,
        current_user=manager,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(
                    user_id=staff.id, assignment_date=day, shift_code=code
                )
                for day, code in cells.items()
            ],
        ),
    )
    period.status = RosterPeriodStatus.PUBLISHED
    await db.commit()
    return period


async def test_legacy_timesheet_approval_runs_the_rule_check(
    db_async: AsyncSession,
) -> None:
    await _seed(db_async)
    manager = await make_user(db_async, superuser=True)
    staff = await make_user(db_async)
    await make_employee(db_async, user=staff, department_id=DEPT)
    await _published_roster(db_async, manager, staff, {FAR: "D"})
    timesheet = Timesheet(
        user_id=staff.id,
        department_id=DEPT,
        period_start=FAR,
        period_end=FAR + timedelta(days=6),
        status=TimesheetStatus.SUBMITTED,
    )
    db_async.add(timesheet)
    await db_async.flush()
    db_async.add(
        TimesheetEntry(
            timesheet_id=timesheet.id,
            entry_date=FAR,
            shift_code="D",
            overtime_hours=Decimal(4),
        )
    )
    await db_async.commit()
    timesheet_id = timesheet.id

    with pytest.raises(RosterRuleWarningsError):
        await approve_timesheet(
            session=db_async, current_user=manager, timesheet_id=timesheet_id
        )
    approved = await approve_timesheet(
        session=db_async,
        current_user=manager,
        timesheet_id=timesheet_id,
        rule_override_reason="Storm watch overtime",
    )
    assert approved.status == TimesheetStatus.APPROVED
    override = (
        await db_async.scalars(
            select(RosterRuleOverride).where(
                RosterRuleOverride.entity_id == str(timesheet_id)
            )
        )
    ).one()
    assert override.context == "TIMESHEET"


async def test_legacy_leave_cancellation_runs_the_rule_check(
    db_async: AsyncSession,
) -> None:
    await _seed(db_async)
    manager = await make_user(db_async, superuser=True)
    staff = await make_user(db_async)
    await make_employee(db_async, user=staff, department_id=DEPT)
    await _published_roster(
        db_async, manager, staff, {FAR + timedelta(days=n): "D" for n in range(4)}
    )
    leave = LeaveRequest(
        user_id=staff.id,
        department_id=DEPT,
        leave_type=LeaveType.JURY_DUTY,
        start_date=FAR + timedelta(days=1),
        end_date=FAR + timedelta(days=1),
        days_requested=Decimal(1),
        status=RequestStatus.APPROVED,
    )
    db_async.add(leave)
    await db_async.commit()
    leave_id = leave.id

    with pytest.raises(RosterRuleWarningsError):
        await action_leave_request(
            session=db_async,
            current_user=manager,
            leave_request_id=leave_id,
            payload=LeaveRequestAction(status=RequestStatus.CANCELLED),
        )
    cancelled = await action_leave_request(
        session=db_async,
        current_user=manager,
        leave_request_id=leave_id,
        payload=LeaveRequestAction(
            status=RequestStatus.CANCELLED,
            rule_override_reason="Jury service withdrawn",
        ),
    )
    assert cancelled.status == RequestStatus.CANCELLED


# --- reason hygiene and the error body ---------------------------------------------


def test_reason_refuses_nul_and_strips_control_characters() -> None:
    with pytest.raises(ValidationError):
        RosterPublishRequest(rule_override_reason="cover\x00shift")
    cleaned = RosterPublishRequest(rule_override_reason="\x07Cover\tfor\nleave\x1b")
    assert cleaned.rule_override_reason == "Cover\tfor\nleave"


async def test_extra_error_fields_never_replace_detail() -> None:
    error = AppException("Real message", 409)
    error.extra = {"detail": "spoofed", "code": "ROSTER_RULE_WARNINGS"}
    response = await app_exception_handler(None, error)  # type: ignore[arg-type]
    body = response.body.decode()
    assert '"detail":"Real message"' in body
    assert "spoofed" not in body


async def test_publish_refuses_a_nul_reason(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    await _seed(db_async)
    manager = await make_user(db_async, superuser=True)
    staff = await make_user(db_async)
    await make_employee(db_async, user=staff, department_id=DEPT)
    period = await create_roster_period(
        session=db_async,
        current_user=manager,
        period_in=RosterPeriodCreate(
            department_id=DEPT, period_start=FAR, period_end=FAR + timedelta(27)
        ),
    )
    response = await async_client.patch(
        f"{settings.API_V1_STR}/hr/rosters/periods/{period.id}/publish",
        headers=superuser_token_headers_async,
        json={"rule_override_reason": "cover\u0000"},
    )
    assert response.status_code == 422


# --- audit history ------------------------------------------------------------------


async def test_override_history_is_readable_on_the_roster_period(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    await _seed(db_async)
    manager = await make_user(db_async, superuser=True)
    staff = await make_user(db_async)
    await make_employee(db_async, user=staff, department_id=DEPT)
    period = await create_roster_period(
        session=db_async,
        current_user=manager,
        period_in=RosterPeriodCreate(
            department_id=DEPT, period_start=FAR, period_end=FAR + timedelta(27)
        ),
    )
    await bulk_upsert_roster_assignments(
        session=db_async,
        current_user=manager,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(
                    user_id=staff.id,
                    assignment_date=FAR + timedelta(days=n),
                    shift_code="D",
                )
                for n in range(4)
            ],
        ),
    )
    publish = await async_client.patch(
        f"{settings.API_V1_STR}/hr/rosters/periods/{period.id}/publish",
        headers=superuser_token_headers_async,
        json={"rule_override_reason": "Short-staffed"},
    )
    assert publish.status_code == 200, publish.text
    history = await async_client.get(
        f"{settings.API_V1_STR}/audit/roster_period/{period.id}",
        headers=superuser_token_headers_async,
    )
    assert history.status_code == 200, history.text
    assert "rule_override" in history.text
