"""Who the caller is to the stores: organisation, department and scoped authority.

Tenancy is not invented here. The caller's organisation and department come from
their HR employment record; approval and management authority come from role
assignments through ``src.hr.organisations.permitted_departments``.
"""

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import has_permission
from src.hr.models import Department, EmploymentRecord, EmploymentStatus
from src.hr.organisations import permitted_departments

from .exceptions import StoresPermissionError

VIEW = "stores.view"
REQUEST = "stores.request"
APPROVE = "stores.approve"
MANAGE = "stores.manage"


@dataclass(frozen=True)
class Context:
    user: User
    organisation_id: str
    department_id: str


async def context_for(session: AsyncSession, user: User) -> Context:
    employment = await session.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == user.id)
    )
    if employment is None or employment.status != EmploymentStatus.ACTIVE:
        raise StoresPermissionError("Stores access needs an active employment record")
    return Context(user, employment.organisation_id, employment.department_id)


def require(ctx: Context, key: str) -> None:
    if not has_permission(current_user=ctx.user, permission_key=key):
        raise StoresPermissionError("Insufficient permission")


async def scoped_departments(session: AsyncSession, ctx: Context, key: str) -> set[str]:
    """Departments of the caller's organisation where the caller holds ``key``."""
    if not has_permission(current_user=ctx.user, permission_key=key):
        return set()
    return await permitted_departments(session, ctx.user, ctx.organisation_id, key)


async def organisation_departments(session: AsyncSession, ctx: Context) -> set[str]:
    rows = await session.execute(
        select(Department.id).where(Department.organisation_id == ctx.organisation_id)
    )
    return set(rows.scalars().all())


async def has_organisation_wide_manage(session: AsyncSession, ctx: Context) -> bool:
    """Catalogue, locations and stock belong to the organisation: managing them
    needs a ``stores.manage`` grant that covers every department."""
    permitted = await scoped_departments(session, ctx, MANAGE)
    return bool(permitted) and permitted >= await organisation_departments(session, ctx)


async def require_organisation_wide_manage(session: AsyncSession, ctx: Context) -> None:
    if not await has_organisation_wide_manage(session, ctx):
        raise StoresPermissionError(
            "Managing stores needs an organisation-wide stores.manage grant"
        )
