"""Document-specific scope, shared by list, detail and mutation checks.

Only
active assignments confer authority over another employee; flat role membership
is insufficient. Full personnel access uses the existing document-manage grant.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import col, select

from src.auth.models import RoleAssignmentScope, User, UserRoleAssignment
from src.hr.models import EmploymentRecord
from src.hr.organisations import resolve_organisation
from src.utils.datetime import utc_now

from .models import DocumentCategory, DocumentSensitivity, EmployeeDocument

LAUNCH_CATEGORIES = frozenset(
    {
        DocumentCategory.CONTRACT,
        DocumentCategory.IDENTIFICATION,
        DocumentCategory.CERTIFICATION,
        DocumentCategory.LICENCE,
        DocumentCategory.QUALIFICATION,
        DocumentCategory.SIGNED_FORM,
    }
)
SUPERVISOR_CATEGORIES = frozenset(
    {
        DocumentCategory.CERTIFICATION,
        DocumentCategory.LICENCE,
        DocumentCategory.QUALIFICATION,
    }
)


@dataclass
class DocumentAccess:
    organisation_id: str
    actor_id: uuid.UUID
    read_users: set[uuid.UUID]
    manage_users: set[uuid.UUID]
    create_users: set[uuid.UUID]

    def can_read(self, document: EmployeeDocument) -> bool:
        if (
            document.organisation_id != self.organisation_id
            or document.category not in LAUNCH_CATEGORIES
            or document.sensitivity != DocumentSensitivity.STANDARD
        ):
            return False
        return (
            document.user_id == self.actor_id
            or document.user_id in self.manage_users
            or (
                document.user_id in self.read_users
                and document.category in SUPERVISOR_CATEGORIES
            )
        )

    def can_manage(self, document: EmployeeDocument) -> bool:
        return self.can_read(document) and (
            document.user_id in self.manage_users
            or (
                document.user_id == self.actor_id
                and document.uploaded_by_user_id == self.actor_id
            )
        )


async def resolve_access(
    session: AsyncSession, actor: User, organisation_id: str | None = None
) -> DocumentAccess:
    """Resolve scopes once per request, including expired/revoked assignments.

    GAA's staff registry is small: sets keep all document operations on exactly the
    same policy, and avoid per-document permission queries on paginated lists.
    """
    organisation_id = await resolve_organisation(session, actor, organisation_id)
    employment = {
        record.user_id: record.department_id
        for record in (
            await session.execute(
                select(EmploymentRecord).where(
                    EmploymentRecord.organisation_id == organisation_id
                )
            )
        )
        .scalars()
        .all()
    }
    historical_subjects = set(
        (
            await session.execute(
                select(EmployeeDocument.user_id).where(
                    EmployeeDocument.organisation_id == organisation_id
                )
            )
        )
        .scalars()
        .all()
    )
    now = utc_now()
    assignments = (
        (
            await session.execute(
                select(UserRoleAssignment).where(
                    col(UserRoleAssignment.user_id) == actor.id,
                    UserRoleAssignment.organisation_id == organisation_id,
                    col(UserRoleAssignment.effective_from) <= now,
                    col(UserRoleAssignment.effective_to).is_(None)
                    | (col(UserRoleAssignment.effective_to) > now),
                )
            )
        )
        .scalars()
        .all()
    )
    permissions = {role.id: {p.key for p in role.permissions} for role in actor.roles}

    def targets(key: str) -> set[uuid.UUID]:
        if actor.is_superuser:
            return set(employment) | historical_subjects | {actor.id}
        users: set[uuid.UUID] = set()
        for assignment in assignments:
            if key not in permissions.get(assignment.role_id, set()):
                continue
            if assignment.scope == RoleAssignmentScope.ALL:
                users.update(set(employment) | historical_subjects)
            elif assignment.scope == RoleAssignmentScope.SELF:
                users.add(actor.id)
            elif assignment.scope == RoleAssignmentScope.DEPARTMENT:
                department = assignment.department_id
                if department:
                    users.update(
                        uid for uid, dept in employment.items() if dept == department
                    )
        return users

    managed = targets("hr.document.manage")
    created = targets("hr.document.create") & managed
    if actor.id in employment and actor.id in targets("hr.document.create"):
        created.add(actor.id)
    return DocumentAccess(
        organisation_id=organisation_id,
        actor_id=actor.id,
        read_users=targets("hr.document.read.department") | managed,
        manage_users=managed,
        create_users=created,
    )
