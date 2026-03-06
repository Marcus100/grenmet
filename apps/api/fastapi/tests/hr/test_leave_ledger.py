from decimal import Decimal

from sqlmodel import Session, select

from src.auth.models import Permission, Role, RoleAssignmentScope, UserRoleAssignment
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.hr.models import Department, EmploymentRecord
from src.hr.leave.models import LeaveBalanceEvent
from src.hr.leave.schemas import LeaveRequestAction, LeaveRequestCreate
from src.hr.leave.service import action_leave_request, create_leave_request
from src.hr.models import RequestStatus
from tests.utils.utils import random_email, random_lower_string


def test_leave_approval_writes_balance_event(db: Session) -> None:
    supervisor = create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(),
            username=f"ls_{random_lower_string()}",
            password="password123",
            first_name="Ledger",
            last_name="Supervisor",
        ),
    )
    employee = create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(),
            username=f"le_{random_lower_string()}",
            password="password123",
            first_name="Ledger",
            last_name="Employee",
        ),
    )
    role = db.exec(select(Role).where(Role.name == "SUPERVISOR")).first()
    if not role:
        role = Role(name="SUPERVISOR")
        db.add(role)
        db.commit()
        db.refresh(role)
    leave_action_permission = db.exec(
        select(Permission).where(Permission.key == "leave.request.action")
    ).first()
    if not leave_action_permission:
        leave_action_permission = Permission(
            key="leave.request.action",
            action="update",
            entity="leave_request",
            access="department",
            description="Action leave requests",
        )
    role.permissions.append(leave_action_permission)
    if role.id not in {assigned_role.id for assigned_role in supervisor.roles}:
        supervisor.roles.append(role)
    employee_role = Role(name=f"EMPLOYEE_{random_lower_string().upper()}")
    leave_create_permission = Permission(
        key=f"leave.request.create.self.{random_lower_string()}",
        action="create",
        entity="leave_request",
        access="self",
        description="Create own leave request",
    )
    canonical_leave_create_permission = db.exec(
        select(Permission).where(Permission.key == "leave.request.create.self")
    ).first()
    if not canonical_leave_create_permission:
        canonical_leave_create_permission = Permission(
            key="leave.request.create.self",
            action="create",
            entity="leave_request",
            access="self",
            description="Create own leave request",
        )
    employee_role.permissions.append(leave_create_permission)
    employee_role.permissions.append(canonical_leave_create_permission)
    employee.roles.append(employee_role)
    db.add(employee_role)
    db.add(leave_create_permission)
    db.add(canonical_leave_create_permission)
    if not db.get(Department, "dept_leave"):
        db.add(Department(id="dept_leave", name="Dept Leave"))
    db.add(
        EmploymentRecord(
            user_id=supervisor.id,
            employee_number=f"SUP-{random_lower_string()}",
            department_id="dept_leave",
            position="Supervisor",
        )
    )
    db.add(
        EmploymentRecord(
            user_id=employee.id,
            employee_number=f"EMP-{random_lower_string()}",
            department_id="dept_leave",
            position="Forecaster",
        )
    )
    db.add(
        UserRoleAssignment(
            user_id=supervisor.id,
            role_id=role.id,
            scope=RoleAssignmentScope.DEPARTMENT,
            department_id="dept_leave",
        )
    )
    db.add(
        UserRoleAssignment(
            user_id=employee.id,
            role_id=employee_role.id,
            scope=RoleAssignmentScope.SELF,
        )
    )
    db.commit()

    leave_request = create_leave_request(
        session=db,
        current_user=employee,
        payload=LeaveRequestCreate(
            department_id="dept_leave",
            leave_type="ANNUAL",
            start_date="2026-04-01",
            end_date="2026-04-02",
            days_requested=Decimal("2.0"),
        ),
    )
    action_leave_request(
        session=db,
        current_user=supervisor,
        leave_request_id=leave_request.id,
        payload=LeaveRequestAction(status=RequestStatus.APPROVED),
    )
    events = list(
        db.exec(
            select(LeaveBalanceEvent).where(LeaveBalanceEvent.related_leave_request_id == leave_request.id)
        ).all()
    )
    assert len(events) == 1
    assert events[0].delta_days == Decimal("-2.0")
