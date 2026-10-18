"""Change-history subject for QC decisions on register observations.

History is readable by staff who can decide QC or send observations.
"""

from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import registry
from src.auth.models import User
from src.auth.policy import has_permission

from .qc import AUDIT_ENTITY

READ_PERMISSIONS = ("eregister.qc", "eregister.send")


async def _staff(_session: AsyncSession, actor: User, _entity_id: str) -> bool:
    return any(
        has_permission(current_user=actor, permission_key=key)
        for key in READ_PERMISSIONS
    )


def register() -> None:
    registry.register_entity(AUDIT_ENTITY, _staff)
