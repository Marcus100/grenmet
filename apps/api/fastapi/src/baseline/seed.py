"""Create-once business bootstrap. Call inside one database transaction."""

import secrets
from typing import Any

from sqlalchemy import text
from sqlmodel import Session, col, select

from src.auth.models import Role, RoleAssignmentScope, User, UserRoleAssignment
from src.auth.utils import get_password_hash
from src.baseline.models import ApprovalPolicy, BaselineStep, StaffCredential
from src.hr.models import Department, EmploymentRecord, Grade
from src.hr.workflow.models import WorkflowStepTemplate, WorkflowTemplate, WorkflowType

KEY = "gaa-gms-production-v1"


def seed_baseline(
    session: Session, profile: dict[str, Any], *, apply: bool = False
) -> dict[str, Any]:
    if apply:
        session.execute(text("SELECT pg_advisory_xact_lock(73190506)"))
    if session.get(BaselineStep, KEY):
        return {"status": "already_initialised", "changes": []}
    people = profile["people"]
    if len({p["username"] for p in people}) != len(people):
        raise ValueError("Duplicate roster usernames")
    grade_specs = {g["code"]: g for g in profile["grades"]}
    if any(p["grade"] not in grade_specs for p in people):
        raise ValueError("Unknown roster grade")
    if "ewhint" not in {p["username"] for p in people}:
        raise ValueError("Approved administrator ewhint is missing")
    roles = {r.name: r for r in session.exec(select(Role)).all()}
    required = {
        "staff",
        "hr-supervisor",
        "management",
        "cap-author",
        "cap-approver",
        "cap-publisher",
    }
    if required - roles.keys():
        raise ValueError("Run initial_data.py first; required roles are missing")
    changes = [
        f"Staff credential and draft onboarding: {p['username']}" for p in people
    ]
    for person in people:
        email = f"{person['username']}@weather.gd"
        existing_email = session.exec(select(User).where(User.email == email)).first()
        existing_name = session.exec(
            select(User).where(User.username == person["username"])
        ).first()
        if existing_name and existing_name.email != email:
            raise ValueError(f"Username conflict: {person['username']}")
        if existing_email and (
            existing_email.username != person["username"]
            or existing_email.is_superuser != (person["username"] == "ewhint")
        ):
            raise ValueError(f"Account conflict requires review: {person['username']}")
    if not apply:
        return {
            "status": "preview",
            "changes": changes,
            "requires_online_completion": [
                "mailbox readiness",
                "employee numbers",
                "employment details",
                "opening leave balances",
                "photos",
            ],
        }
    dept_id = profile["department"]["code"].lower()
    if session.get(Department, dept_id) is None:
        session.add(Department(id=dept_id, name=profile["department"]["name"]))
        session.flush()
    for code, spec in grade_specs.items():
        gid = f"{dept_id.upper()}_{code}"
        if session.get(Grade, gid) is None:
            session.add(
                Grade(
                    id=gid,
                    department_id=dept_id,
                    code=code,
                    label=spec["label"],
                    rank=spec["rank"],
                    establishment_band=spec.get("establishment_band"),
                )
            )
    session.flush()
    for person in people:
        email = f"{person['username']}@weather.gd"
        user = session.exec(select(User).where(User.email == email)).first()
        if user is None:
            if session.exec(
                select(User).where(User.username == person["username"])
            ).first():
                raise ValueError(f"Username conflict: {person['username']}")
            names = person["full_name"].split()
            user = User(
                email=email,
                username=person["username"],
                first_name=names[0],
                middle_name=" ".join(names[1:-1]) or None,
                last_name=names[-1],
                hashed_password=get_password_hash(secrets.token_urlsafe(48)),
                is_active=False,
                is_superuser=person["username"] == "ewhint",
                email_verification_required=True,
                password_setup_pending=True,
            )
            session.add(user)
            session.flush()
        elif user.username != person["username"] or user.is_superuser != (
            person["username"] == "ewhint"
        ):
            raise ValueError(f"Account conflict requires review: {person['username']}")
        # Existing credentials and their live role assignments are authoritative.
        if session.get(StaffCredential, user.id):
            continue
        session.add(
            StaffCredential(
                user_id=user.id,
                department_id=dept_id,
                grade_id=f"{dept_id.upper()}_{person['grade']}",
            )
        )
        employment = session.exec(
            select(EmploymentRecord).where(EmploymentRecord.user_id == user.id)
        ).first()
        if employment is None:
            session.add(
                EmploymentRecord(
                    user_id=user.id,
                    department_id=dept_id,
                    grade_id=f"{dept_id.upper()}_{person['grade']}",
                    position=grade_specs[person["grade"]]["label"],
                    roster_name=person.get("roster_name"),
                    employee_number=None,
                    employment_type=None,
                    start_date=None,
                )
            )
        names = ["staff"]
        if person["grade"] in {"MANAGER", "ASSISTANT_MANAGER", "SENIOR_TECH"}:
            names += ["hr-supervisor", "cap-author", "cap-approver", "cap-publisher"]
        if person["grade"] in {"MANAGER", "ASSISTANT_MANAGER"}:
            names.append("management")
        for name in names:
            role = roles[name]
            if role.id not in {r.id for r in user.roles}:
                user.roles.append(role)
            exists = session.exec(
                select(UserRoleAssignment).where(
                    UserRoleAssignment.user_id == user.id,
                    UserRoleAssignment.role_id == role.id,
                )
            ).first()
            if exists is None:
                scope = (
                    RoleAssignmentScope.SELF
                    if name == "staff"
                    else RoleAssignmentScope.DEPARTMENT
                )
                session.add(
                    UserRoleAssignment(
                        user_id=user.id,
                        role_id=role.id,
                        scope=scope,
                        department_id=dept_id
                        if scope == RoleAssignmentScope.DEPARTMENT
                        else None,
                    )
                )
    for kind in WorkflowType:
        template = session.exec(
            select(WorkflowTemplate).where(
                WorkflowTemplate.department_id == dept_id,
                WorkflowTemplate.workflow_type == kind,
                col(WorkflowTemplate.is_active).is_(True),
            )
        ).first()  # noqa: E712
        if template is None:
            template = WorkflowTemplate(
                department_id=dept_id,
                workflow_type=kind,
                name=kind.value.replace("_", " ").title(),
            )
            session.add(template)
            session.flush()
            for order, name in enumerate(("hr-supervisor", "management"), 1):
                session.add(
                    WorkflowStepTemplate(
                        workflow_template_id=template.id,
                        step_order=order,
                        required_role_id=roles[name].id,
                        required_scope=RoleAssignmentScope.DEPARTMENT,
                    )
                )
        policy_key = f"hr:{dept_id}:{kind.value}"
        if session.get(ApprovalPolicy, policy_key) is None:
            session.add(ApprovalPolicy(key=policy_key))
    if session.get(ApprovalPolicy, "cap") is None:
        session.add(ApprovalPolicy(key="cap"))
    session.add(BaselineStep(key=KEY))
    session.flush()
    return {"status": "initialised", "changes": changes}
