"""Who may see and act on payroll inputs.

The four keys are granted to no default role: nobody but a superuser has them
until the owner assigns them. Reading is department-scoped; preparing,
approving and exporting act on a whole organisation's period, so they need an
organisation-wide (ALL scope) assignment. Approve and export also need a
session that passed two-step verification, whatever AUTH_PRIVILEGED_MFA_MODE
says. A period in an organisation the actor has no payroll access to is
reported as not found, never as forbidden.
"""

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import privileged_mfa
from src.auth.models import RoleAssignmentScope, User
from src.exceptions import AppException, NotFoundError
from src.hr.models import Department
from src.hr.organisations import active_assignments, require_organisation_permission

from .models import PayPeriod

logger = logging.getLogger(__name__)

READ_DEPARTMENT = "hr.payroll.read.department"
PREPARE = "hr.payroll.prepare"
APPROVE = "hr.payroll.approve"
EXPORT = "hr.payroll.export"
#: Slice 2: dated rates and basic pay, and every money field.
RATES_MANAGE = "hr.payroll.rates.manage"
READ_AMOUNTS = "hr.payroll.read.amounts"
#: Slice 3: confirming a tax, social insurance or deduction table.
TABLES_CONFIRM = "hr.payroll.tables.confirm"
#: Staff reading and confirming their own payroll records.
READ_SELF = "hr.payroll.read.self"
PAYROLL_KEYS = (
    READ_DEPARTMENT,
    PREPARE,
    APPROVE,
    EXPORT,
    RATES_MANAGE,
    READ_AMOUNTS,
    TABLES_CONFIRM,
)


class PayPeriodNotFoundError(NotFoundError):
    def __init__(self) -> None:
        super().__init__("Pay period not found")


async def visible_departments(
    session: AsyncSession, actor: User, organisation_id: str
) -> set[str]:
    """Departments whose pay lines the actor may read in this organisation.

    Any payroll key counts. SELF-scope assignments grant nothing here: payroll
    lines are other people's figures, so only ALL or DEPARTMENT scope reads.
    """
    departments = set(
        (
            await session.execute(
                select(Department.id).where(
                    Department.organisation_id == organisation_id
                )
            )
        )
        .scalars()
        .all()
    )
    if actor.is_superuser:
        return departments
    roles = {
        role.id
        for role in actor.roles
        if any(p.key.lower() in PAYROLL_KEYS for p in role.permissions)
    }
    permitted: set[str] = set()
    for assignment in await active_assignments(session, actor.id):
        if (
            assignment.organisation_id != organisation_id
            or assignment.role_id not in roles
        ):
            continue
        if assignment.scope == RoleAssignmentScope.ALL:
            return departments
        if (
            assignment.scope == RoleAssignmentScope.DEPARTMENT
            and assignment.department_id
        ):
            permitted.add(assignment.department_id)
    return permitted & departments


async def require_visible(
    session: AsyncSession, actor: User, organisation_id: str
) -> set[str]:
    """Visible departments, or 404 when the actor has no payroll access here."""
    visible = await visible_departments(session, actor, organisation_id)
    if not visible and not actor.is_superuser:
        raise PayPeriodNotFoundError()
    return visible


async def require_organisation_wide(
    session: AsyncSession, actor: User, organisation_id: str, key: str
) -> None:
    try:
        await require_organisation_permission(session, actor, organisation_id, key)
    except AppException:
        logger.warning(
            "Payroll permission denied",
            extra={"actor_id": str(actor.id), "permission_key": key},
        )
        raise


async def load_period(
    session: AsyncSession,
    actor: User,
    period_id: uuid.UUID,
    *,
    for_update: bool = False,
) -> tuple[PayPeriod, set[str]]:
    statement = select(PayPeriod).where(PayPeriod.id == period_id)
    if for_update:
        statement = statement.with_for_update()
    period = await session.scalar(statement)
    if period is None:
        raise PayPeriodNotFoundError()
    return period, await require_visible(session, actor, period.organisation_id)


async def lock_period(
    session: AsyncSession, actor: User, period_id: uuid.UUID, key: str
) -> PayPeriod:
    """Check the organisation-wide key first, then lock the period row.

    Nobody without the key can hold a row lock on another organisation's period.
    """
    period, _ = await load_period(session, actor, period_id)
    await require_organisation_wide(session, actor, period.organisation_id, key)
    await session.refresh(period, with_for_update=True)
    return period


async def holds_organisation_wide(
    session: AsyncSession, actor: User, organisation_id: str, keys: tuple[str, ...]
) -> bool:
    for key in keys:
        try:
            await require_organisation_permission(session, actor, organisation_id, key)
        except AppException:
            continue
        return True
    return False


async def require_mfa(session: AsyncSession, actor: User, token: str) -> None:
    """Approve and export need an enrolled authenticator and an MFA-verified session."""
    from src.dependencies import _token_app

    await privileged_mfa.require_mfa_session(
        session, actor, token=token, app_key=_token_app(token)
    )


async def period_approvers(session: AsyncSession, period: PayPeriod) -> set[uuid.UUID]:
    """Everyone who approved this period, across ALL of its workflow instances.

    A returned and resubmitted period gets a new instance each time, so looking
    only at the current one would let an earlier approver slip back in.
    """
    from src.hr.workflow.models import (
        WorkflowAction,
        WorkflowInstance,
        WorkflowStepInstance,
    )

    return {
        user_id
        for user_id in (
            await session.execute(
                select(WorkflowStepInstance.approver_user_id)
                .join(
                    WorkflowInstance,
                    WorkflowInstance.id == WorkflowStepInstance.workflow_instance_id,
                )
                .where(
                    WorkflowInstance.entity_type == "pay_period",
                    WorkflowInstance.entity_id == period.id,
                    WorkflowStepInstance.action == WorkflowAction.APPROVE,
                )
            )
        ).scalars()
        if user_id is not None
    }


async def period_conflict(
    session: AsyncSession, actor: User, period: PayPeriod
) -> str | None:
    """Why this person may not approve or return the period, or None.

    Refused to whoever prepared it or added any line, whoever has pay in it
    (their own lines, hence payslip), and whoever last changed a pay profile or
    a department's shift-worker default that the period's lines depend on.
    """
    from .models import EmployeePayProfile, PayLine, PayrollDepartmentSetting

    if period.submitted_by_user_id == actor.id or await session.scalar(
        select(PayLine.id)
        .where(PayLine.period_id == period.id, PayLine.created_by_user_id == actor.id)
        .limit(1)
    ):
        return "Someone who prepared or added lines to this period cannot approve or return it"
    if await session.scalar(
        select(PayLine.id)
        .where(PayLine.period_id == period.id, PayLine.user_id == actor.id)
        .limit(1)
    ):
        return "This period contains your own pay, so you cannot approve or return it"
    if await session.scalar(
        select(EmployeePayProfile.user_id)
        .join(PayLine, PayLine.user_id == EmployeePayProfile.user_id)
        .where(
            PayLine.period_id == period.id,
            EmployeePayProfile.updated_by_user_id == actor.id,
        )
        .limit(1)
    ) or await session.scalar(
        select(PayrollDepartmentSetting.department_id)
        .join(PayLine, PayLine.department_id == PayrollDepartmentSetting.department_id)
        .where(
            PayLine.period_id == period.id,
            PayrollDepartmentSetting.updated_by_user_id == actor.id,
        )
        .limit(1)
    ):
        return (
            "You changed a pay profile or shift-worker default this period relies on, "
            "so you cannot approve or return it"
        )
    return None
