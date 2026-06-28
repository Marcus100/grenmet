"""Canonical permission catalog and default roles — single source of truth.

Authorization matches on ``Permission.key`` only (see ``src/auth/policy.py``); the
``action`` / ``entity`` / ``access`` columns on the row are descriptive metadata
derived from the key. Every permission string used anywhere in the code (via
``require_permission(..., permission_key=...)``) MUST appear in ``PERMISSIONS`` —
``tests/auth/test_permission_registry.py`` enforces this.

Seeders are idempotent and run from ``init_db`` / ``init_db_async`` (prestart path).
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import Session, select

from src.auth.models import Permission, Role


@dataclass(frozen=True)
class PermissionDef:
    key: str
    description: str


# --- Permission catalog (grouped by domain) -------------------------------------

PERMISSIONS: tuple[PermissionDef, ...] = (
    # HR — employment & profile
    PermissionDef("hr.employment.manage", "Manage employment records"),
    # HR — roster
    PermissionDef("roster.view", "View rosters"),
    PermissionDef("roster.manage", "Create and manage rosters"),
    PermissionDef("roster.import", "Import rosters from CSV"),
    # HR — timesheet
    PermissionDef("timesheet.submit.self", "Submit own timesheet"),
    PermissionDef("timesheet.submit.proxy", "Submit a timesheet on behalf of another"),
    PermissionDef("timesheet.approve", "Approve timesheets"),
    PermissionDef("timesheet.read.department", "Read timesheets across a department"),
    # HR — leave
    PermissionDef("leave.request.create.self", "Create own leave request"),
    PermissionDef("leave.request.action", "Approve/reject leave requests"),
    # HR — absentee
    PermissionDef("absentee.report.create", "Create absentee reports"),
    PermissionDef(
        "absentee.report.read.department", "Read absentee reports across a department"
    ),
    # HR — shift exchange
    PermissionDef("shift_swap.request.create.self", "Create own shift swap request"),
    PermissionDef("shift_swap.request.action", "Approve/reject shift swap requests"),
    # HR — daily status report
    PermissionDef("status.report.create", "Create daily status reports"),
    PermissionDef("status.report.read", "Read daily status reports"),
    # HR — parking permit
    PermissionDef("parking.permit.create", "Create parking permit applications"),
    PermissionDef("parking.permit.issue", "Issue parking decals"),
    PermissionDef(
        "parking.permit.read.department", "Read parking permits across a department"
    ),
    # HR — workflow engine
    PermissionDef("workflow.template.manage", "Manage workflow templates"),
    PermissionDef("workflow.template.view", "View workflow templates"),
    PermissionDef("workflow.instance.action", "Act on workflow instances"),
    PermissionDef("workflow.instance.view", "View workflow instances"),
    # CAP — alert lifecycle
    PermissionDef("cap.alert.create", "Create CAP alerts"),
    PermissionDef("cap.alert.edit", "Edit CAP alerts"),
    PermissionDef("cap.alert.submit", "Submit CAP alerts for approval"),
    PermissionDef("cap.alert.approve", "Approve CAP alerts"),
    PermissionDef("cap.alert.publish", "Publish CAP alerts"),
    PermissionDef("cap.alert.read", "Read CAP alerts"),
    # CAP — administration
    PermissionDef("cap.integrations.manage", "Manage CAP integrations"),
    PermissionDef("cap.settings.manage", "Manage CAP settings"),
)

ALL_PERMISSION_KEYS: frozenset[str] = frozenset(p.key for p in PERMISSIONS)


# --- Default roles -> permission bundles -----------------------------------------
# Names and bundles are sensible starting points; adjust to taste. Superusers
# (``User.is_superuser``) bypass all checks and need no role.

DEFAULT_ROLES: dict[str, tuple[str, tuple[str, ...]]] = {
    "staff": (
        "General staff self-service",
        (
            "leave.request.create.self",
            "timesheet.submit.self",
            "absentee.report.create",
            "shift_swap.request.create.self",
            "status.report.create",
            "parking.permit.create",
            "roster.view",
            "workflow.instance.view",
        ),
    ),
    "hr-supervisor": (
        "Department supervisor: approvals and department reads",
        (
            "timesheet.approve",
            "timesheet.read.department",
            "timesheet.submit.proxy",
            "leave.request.action",
            "absentee.report.read.department",
            "shift_swap.request.action",
            "status.report.read",
            "parking.permit.issue",
            "parking.permit.read.department",
            "roster.view",
            "workflow.instance.action",
            "workflow.instance.view",
        ),
    ),
    "hr-admin": (
        "HR administrator: full HR + workflow management",
        (
            "hr.employment.manage",
            "roster.view",
            "roster.manage",
            "roster.import",
            "timesheet.approve",
            "timesheet.read.department",
            "timesheet.submit.proxy",
            "leave.request.action",
            "absentee.report.read.department",
            "shift_swap.request.action",
            "status.report.read",
            "parking.permit.issue",
            "parking.permit.read.department",
            "workflow.template.manage",
            "workflow.template.view",
            "workflow.instance.action",
            "workflow.instance.view",
        ),
    ),
    "cap-author": (
        "CAP author: draft and submit alerts",
        (
            "cap.alert.create",
            "cap.alert.edit",
            "cap.alert.submit",
            "cap.alert.read",
        ),
    ),
    "cap-approver": (
        "CAP approver: approve submitted alerts",
        ("cap.alert.approve", "cap.alert.read"),
    ),
    "cap-publisher": (
        "CAP publisher: publish approved alerts",
        ("cap.alert.publish", "cap.alert.read"),
    ),
    "cap-admin": (
        "CAP administrator: full alert lifecycle + settings",
        (
            "cap.alert.create",
            "cap.alert.edit",
            "cap.alert.submit",
            "cap.alert.approve",
            "cap.alert.publish",
            "cap.alert.read",
            "cap.integrations.manage",
            "cap.settings.manage",
        ),
    ),
    "workflow-admin": (
        "Workflow administrator",
        (
            "workflow.template.manage",
            "workflow.template.view",
            "workflow.instance.action",
            "workflow.instance.view",
        ),
    ),
}


def _derive_columns(key: str) -> tuple[str, str, str]:
    """Derive descriptive (entity, action, access) from a dotted permission key.

    These columns are descriptive only — authorization uses the key.
    """
    parts = key.split(".")
    entity = parts[0]
    action = parts[1] if len(parts) > 1 else "manage"
    access = ".".join(parts[2:]) if len(parts) > 2 else "any"
    return entity, action, access


def seed_permissions_and_roles(session: Session) -> None:
    """Idempotently upsert the permission catalog and default roles (sync).

    Commits at the end so no locks are held open (important: ``init_db`` runs from a
    long-lived, session-scoped fixture in tests — an uncommitted transaction here
    would block every table-truncating test).
    """
    existing = {p.key: p for p in session.exec(select(Permission)).all()}
    key_to_perm: dict[str, Permission] = {}
    for pdef in PERMISSIONS:
        perm = existing.get(pdef.key)
        if perm is None:
            entity, action, access = _derive_columns(pdef.key)
            perm = Permission(
                key=pdef.key,
                entity=entity,
                action=action,
                access=access,
                description=pdef.description,
            )
            session.add(perm)
        elif perm.description != pdef.description:
            perm.description = pdef.description
            session.add(perm)
        key_to_perm[pdef.key] = perm
    session.flush()

    for role_name, (description, keys) in DEFAULT_ROLES.items():
        role = session.exec(select(Role).where(Role.name == role_name)).first()
        if role is None:
            role = Role(name=role_name, description=description)
            session.add(role)
            session.flush()
        current = {p.key for p in role.permissions}
        for key in keys:
            if key not in current:
                role.permissions.append(key_to_perm[key])
        session.add(role)
    session.commit()


async def seed_permissions_and_roles_async(session: AsyncSession) -> None:
    """Idempotent async variant of :func:`seed_permissions_and_roles`."""
    perm_result = await session.execute(select(Permission))
    existing = {p.key: p for p in perm_result.scalars().all()}
    key_to_perm: dict[str, Permission] = {}
    for pdef in PERMISSIONS:
        perm = existing.get(pdef.key)
        if perm is None:
            entity, action, access = _derive_columns(pdef.key)
            perm = Permission(
                key=pdef.key,
                entity=entity,
                action=action,
                access=access,
                description=pdef.description,
            )
            session.add(perm)
        elif perm.description != pdef.description:
            perm.description = pdef.description
            session.add(perm)
        key_to_perm[pdef.key] = perm
    await session.flush()

    for role_name, (description, keys) in DEFAULT_ROLES.items():
        role_result = await session.execute(
            select(Role)
            .where(Role.name == role_name)
            .options(selectinload(Role.permissions))  # type: ignore[arg-type]
        )
        role = role_result.scalars().first()
        if role is None:
            role = Role(
                name=role_name,
                description=description,
                permissions=[key_to_perm[key] for key in keys],
            )
            session.add(role)
        else:
            current = {p.key for p in role.permissions}
            for key in keys:
                if key not in current:
                    role.permissions.append(key_to_perm[key])
            session.add(role)
    await session.commit()
