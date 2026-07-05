"""Seed a clickable HR leave-approval demo for the Meteorology department.

Idempotently creates:
- the Meteorology department (reused if one already exists, by id or name),
- demo users (a requester, two peers, a supervisor, a manager) — all with the
  same known password,
- employment records for the requester + peers (so they appear in the
  co-approver picker),
- role assignments (staff / hr-supervisor / management),
- supervisor -> management workflow templates for LEAVE_REQUEST, SHIFT_SWAP,
  ABSENTEE_REPORT, and STATUS_REPORT.

Run from apps/api/fastapi:
    uv run python scripts/seed_hr_leave_demo.py
"""

import logging

from sqlmodel import Session, select

from src.auth.models import Role, RoleAssignmentScope, User, UserRoleAssignment
from src.auth.permissions import seed_permissions_and_roles
from src.auth.schemas import UserCreate
from src.auth.service import create_user_sync
from src.database import engine
from src.hr.models import Department, EmploymentRecord
from src.hr.workflow.models import (
    WorkflowStepTemplate,
    WorkflowTemplate,
    WorkflowType,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("seed_hr_leave_demo")

DEPARTMENT_ID = "MET"
DEPARTMENT_NAME = "Meteorology"
PASSWORD = "demo-pass-123"

# email, username, first, last, role, scope, needs_employment, position
DEMO_USERS = [
    (
        "demo.requester@barrels.gd", "demo_requester", "Rita", "Requester",
        "staff", RoleAssignmentScope.SELF, True, "Meteorological Officer",
    ),
    (
        "demo.peer1@barrels.gd", "demo_peer1", "Peter", "Peer",
        "staff", RoleAssignmentScope.SELF, True, "Meteorological Officer",
    ),
    (
        "demo.peer2@barrels.gd", "demo_peer2", "Paula", "Peer",
        "staff", RoleAssignmentScope.SELF, True, "Meteorological Officer",
    ),
    (
        "demo.supervisor@barrels.gd", "demo_supervisor", "Sam", "Supervisor",
        "hr-supervisor", RoleAssignmentScope.ALL, False, "Supervisor",
    ),
    (
        "demo.manager@barrels.gd", "demo_manager", "Mary", "Manager",
        "management", RoleAssignmentScope.ALL, False, "Manager",
    ),
]


def _resolve_department(session: Session) -> Department:
    """Reuse an existing Meteorology department (by id or name), else create it."""
    dept = session.get(Department, DEPARTMENT_ID)
    if dept is None:
        dept = session.exec(
            select(Department).where(Department.name == DEPARTMENT_NAME)
        ).first()
    if dept is None:
        dept = Department(id=DEPARTMENT_ID, name=DEPARTMENT_NAME)
        session.add(dept)
        session.commit()
        session.refresh(dept)
    logger.info("Using department %s (%s)", dept.id, dept.name)
    return dept


def _get_or_create_user(
    session: Session, email: str, username: str, first: str, last: str
) -> User:
    existing = session.exec(select(User).where(User.email == email)).first()
    if existing:
        return existing
    return create_user_sync(
        session=session,
        user_create=UserCreate(
            email=email,
            username=username,
            password=PASSWORD,
            first_name=first,
            last_name=last,
        ),
    )


def _ensure_role_assignment(
    session: Session,
    user: User,
    role_name: str,
    scope: RoleAssignmentScope,
    department_id: str,
) -> None:
    role = session.exec(select(Role).where(Role.name == role_name)).first()
    if role is None:
        logger.warning("Role %s not found — skipping assignment", role_name)
        return
    if role.id not in {assigned.id for assigned in user.roles}:
        user.roles.append(role)
        session.add(user)
    existing = session.exec(
        select(UserRoleAssignment).where(
            UserRoleAssignment.user_id == user.id,
            UserRoleAssignment.role_id == role.id,
        )
    ).first()
    if existing is None:
        session.add(
            UserRoleAssignment(
                user_id=user.id,
                role_id=role.id,
                scope=scope,
                department_id=(
                    department_id
                    if scope == RoleAssignmentScope.DEPARTMENT
                    else None
                ),
            )
        )


def _ensure_employment(
    session: Session, user: User, position: str, department_id: str
) -> None:
    existing = session.exec(
        select(EmploymentRecord).where(EmploymentRecord.user_id == user.id)
    ).first()
    if existing:
        return
    session.add(
        EmploymentRecord(
            user_id=user.id,
            employee_number=f"DEMO-{user.username.upper()}",
            department_id=department_id,
            position=position,
        )
    )


# workflow_type -> human-readable template name
TEMPLATE_SPECS: list[tuple[WorkflowType, str]] = [
    (WorkflowType.LEAVE_REQUEST, "Leave approval"),
    (WorkflowType.SHIFT_SWAP, "Shift exchange approval"),
    (WorkflowType.ABSENTEE_REPORT, "Absentee report approval"),
    (WorkflowType.STATUS_REPORT, "Daily status report approval"),
]


def _ensure_template(
    session: Session,
    department_id: str,
    workflow_type: WorkflowType,
    name: str,
) -> None:
    """Idempotently create a supervisor -> management template for a form type."""
    existing = session.exec(
        select(WorkflowTemplate).where(
            WorkflowTemplate.department_id == department_id,
            WorkflowTemplate.workflow_type == workflow_type,
        )
    ).first()
    if existing:
        logger.info(
            "%s template already exists for %s", workflow_type.value, department_id
        )
        return
    supervisor = session.exec(
        select(Role).where(Role.name == "hr-supervisor")
    ).first()
    manager = session.exec(select(Role).where(Role.name == "management")).first()
    if not (supervisor and manager):
        logger.warning("supervisor/management roles missing — skipping template")
        return
    template = WorkflowTemplate(
        department_id=department_id,
        workflow_type=workflow_type,
        name=name,
    )
    session.add(template)
    session.flush()
    session.add(
        WorkflowStepTemplate(
            workflow_template_id=template.id,
            step_order=1,
            required_role_id=supervisor.id,
            required_scope=RoleAssignmentScope.ALL,
        )
    )
    session.add(
        WorkflowStepTemplate(
            workflow_template_id=template.id,
            step_order=2,
            required_role_id=manager.id,
            required_scope=RoleAssignmentScope.ALL,
        )
    )
    logger.info(
        "Created %s template (supervisor -> management)", workflow_type.value
    )


def main() -> None:
    with Session(engine) as session:
        seed_permissions_and_roles(session)
        department = _resolve_department(session)

        for (
            email,
            username,
            first,
            last,
            role_name,
            scope,
            needs_employment,
            position,
        ) in DEMO_USERS:
            user = _get_or_create_user(session, email, username, first, last)
            _ensure_role_assignment(session, user, role_name, scope, department.id)
            if needs_employment:
                _ensure_employment(session, user, position, department.id)
            logger.info("Ready: %s (%s)", email, role_name)

        for workflow_type, template_name in TEMPLATE_SPECS:
            _ensure_template(session, department.id, workflow_type, template_name)
        session.commit()

    logger.info("HR leave demo seed complete.")
    logger.info("All demo users share the password: %s", PASSWORD)
    logger.info(
        "Log in as demo.requester@barrels.gd, submit a leave request picking "
        "demo.peer1/peer2 as co-approvers, then approve as each peer, then "
        "demo.supervisor, then demo.manager."
    )


if __name__ == "__main__":
    main()
