"""Audited, additive repair of GMS reference data; never imports staff accounts."""

import json
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.auth.models import Role, RoleAssignmentScope, User
from src.baseline import service
from src.baseline.department import is_gms_department
from src.baseline.models import ApprovalPolicy, BaselineAudit
from src.baseline.schemas import CataloguePreview
from src.exceptions import AppException
from src.hr.models import Department, Grade
from src.hr.workflow.models import WorkflowStepTemplate, WorkflowTemplate, WorkflowType

GRADE_SPECS = json.loads(Path(__file__).with_name("gms-grades.json").read_text())


async def preview(
    session: AsyncSession, actor: User, department_id: str
) -> CataloguePreview:
    service.require_admin(actor)
    if not is_gms_department(department_id) or not await session.get(
        Department, department_id
    ):
        raise AppException(
            "Choose existing department gms or meteorological_department; create new GMS departments with ID gms",
            400,
        )
    result = CataloguePreview(
        department_id=department_id,
        missing_grade_ids=[],
        missing_policy_keys=[],
        missing_workflow_types=[],
        conflicts=[],
    )
    for spec in GRADE_SPECS:
        grade_id = f"GMS_{spec['code']}"
        grade = await session.get(Grade, grade_id)
        same_code = (
            (
                await session.execute(
                    select(Grade).where(
                        Grade.department_id == department_id, Grade.code == spec["code"]
                    )
                )
            )
            .scalars()
            .first()
        )
        if grade and grade.department_id != department_id:
            result.conflicts.append(f"{grade_id} belongs to another department")
        elif same_code and same_code.id != grade_id:
            result.conflicts.append(
                f"Grade code {spec['code']} already uses ID {same_code.id}"
            )
        elif grade and grade.code != spec["code"]:
            result.conflicts.append(
                f"{grade_id} has a different code; review the existing grade"
            )
        elif grade is None:
            result.missing_grade_ids.append(grade_id)
        elif not grade.is_active:
            result.conflicts.append(
                f"{grade_id} is inactive; review activation separately"
            )
    for kind in WorkflowType:
        key = f"hr:{department_id}:{kind.value}"
        if not await session.get(ApprovalPolicy, key):
            result.missing_policy_keys.append(key)
        templates = (
            (
                await session.execute(
                    select(WorkflowTemplate).where(
                        WorkflowTemplate.department_id == department_id,
                        WorkflowTemplate.workflow_type == kind,
                    )
                )
            )
            .scalars()
            .all()
        )
        if not templates:
            result.missing_workflow_types.append(kind.value)
        elif not any(template.is_active for template in templates):
            result.conflicts.append(
                f"{kind.value} has only inactive workflows; review them before onboarding"
            )
        for template in (item for item in templates if item.is_active):
            steps = (
                (
                    await session.execute(
                        select(WorkflowStepTemplate).where(
                            WorkflowStepTemplate.workflow_template_id == template.id
                        )
                    )
                )
                .scalars()
                .all()
            )
            required_orders = sorted(
                {step.step_order for step in steps if step.is_required}
            )
            if not required_orders or required_orders != list(
                range(1, len(required_orders) + 1)
            ):
                result.conflicts.append(
                    f"{kind.value} requires consecutive required approval stages starting at 1"
                )
    if not await session.get(ApprovalPolicy, "cap"):
        result.missing_policy_keys.append("cap")
    if result.missing_workflow_types:
        for name in ("hr-supervisor", "management"):
            role = (
                (await session.execute(select(Role).where(Role.name == name)))
                .scalars()
                .first()
            )
            if role is None:
                result.conflicts.append(f"Required approval role is missing: {name}")
    return result


async def apply(
    session: AsyncSession, actor: User, department_id: str
) -> CataloguePreview:
    service.require_admin(actor)
    await session.execute(text("SELECT pg_advisory_xact_lock(73190506)"))
    before = await preview(session, actor, department_id)
    if before.conflicts:
        raise AppException(
            "Resolve catalogue conflicts before importing: "
            + "; ".join(before.conflicts),
            409,
        )
    for spec in GRADE_SPECS:
        grade_id = f"GMS_{spec['code']}"
        if grade_id in before.missing_grade_ids:
            session.add(Grade(id=grade_id, department_id=department_id, **spec))
    for key in before.missing_policy_keys:
        session.add(
            ApprovalPolicy(
                key=key, allow_self_approval=False, require_distinct_approvers=True
            )
        )
    for kind in before.missing_workflow_types:
        template = WorkflowTemplate(
            department_id=department_id,
            workflow_type=WorkflowType(kind),
            name=kind.replace("_", " ").title(),
        )
        session.add(template)
        await session.flush()
        for order, name in enumerate(("hr-supervisor", "management"), 1):
            role = (
                (await session.execute(select(Role).where(Role.name == name)))
                .scalars()
                .one()
            )
            session.add(
                WorkflowStepTemplate(
                    workflow_template_id=template.id,
                    step_order=order,
                    required_role_id=role.id,
                    required_scope=RoleAssignmentScope.DEPARTMENT,
                )
            )
    if (
        before.missing_grade_ids
        or before.missing_policy_keys
        or before.missing_workflow_types
    ):
        session.add(
            BaselineAudit(
                actor_id=actor.id,
                action="catalogue.import",
                details=before.model_dump(),
            )
        )
    await session.commit()
    return await preview(session, actor, department_id)
