from sqlmodel import Session, select

from src.auth.models import Role, RoleAssignmentScope, UserRoleAssignment
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.hr.authz import can_act_on_user
from src.hr.models import Department, EmploymentRecord
from tests.utils.utils import random_email, random_lower_string


def test_department_scope_assignment_enforced(db: Session) -> None:
    supervisor = create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(),
            username=f"sup_{random_lower_string()}",
            password="password123",
            first_name="Scope",
            last_name="Supervisor",
        ),
    )
    target = create_user(
        session=db,
        user_create=UserCreate(
            email=random_email(),
            username=f"user_{random_lower_string()}",
            password="password123",
            first_name="Scope",
            last_name="Target",
        ),
    )
    role = db.exec(select(Role).where(Role.name == "SUPERVISOR")).first()
    if not role:
        role = Role(name="SUPERVISOR")
        db.add(role)
        db.commit()
        db.refresh(role)

    if not db.get(Department, "dept_scope_a"):
        db.add(Department(id="dept_scope_a", name="Dept Scope A"))
    if not db.get(Department, "dept_scope_b"):
        db.add(Department(id="dept_scope_b", name="Dept Scope B"))
    db.commit()

    db.add(
        EmploymentRecord(
            user_id=supervisor.id,
            employee_number=f"SUP-{random_lower_string()}",
            department_id="dept_scope_a",
            position="Supervisor",
        )
    )
    db.add(
        EmploymentRecord(
            user_id=target.id,
            employee_number=f"TGT-{random_lower_string()}",
            department_id="dept_scope_b",
            position="Officer",
        )
    )
    db.add(
        UserRoleAssignment(
            user_id=supervisor.id,
            role_id=role.id,
            scope=RoleAssignmentScope.DEPARTMENT,
            department_id="dept_scope_a",
        )
    )
    db.commit()

    assert (
        can_act_on_user(
            session=db,
            current_user=supervisor,
            target_user_id=target.id,
            required_role_name="SUPERVISOR",
        )
        is False
    )
