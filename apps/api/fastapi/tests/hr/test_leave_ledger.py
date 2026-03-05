from decimal import Decimal

from sqlmodel import Session, select

from src.auth.models import Role
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.hr.models import Department, EmploymentRecord
from src.hr.operations.models import LeaveBalanceEvent, RequestStatus
from src.hr.operations.schemas import LeaveRequestAction, LeaveRequestCreate
from src.hr.operations.service import action_leave_request, create_leave_request
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
    if role.id not in {assigned_role.id for assigned_role in supervisor.roles}:
        supervisor.roles.append(role)
    supervisor.is_superuser = True
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
