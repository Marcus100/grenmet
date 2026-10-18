"""Change-history registrations for rewards.

Programmes group under ``rewards_program`` (readable by that organisation's
admins and owners); ledger entries group under ``rewards_account`` (the
account's id) and flags under the same subject, readable by holders of
``rewards.manage``. Superusers are always allowed by the audit service.
"""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import registry
from src.auth.models import User
from src.auth.policy import has_permission
from src.organisations.models import Membership, MembershipRole, MembershipStatus

from .models import Entry, Program, ReviewFlag

_MANAGER_ROLES = (MembershipRole.OWNER.value, MembershipRole.ADMIN.value)


async def _rewards_manager(
    _session: AsyncSession, actor: User, _entity_id: str
) -> bool:
    return has_permission(current_user=actor, permission_key="rewards.manage")


async def _program_manager(session: AsyncSession, actor: User, entity_id: str) -> bool:
    if has_permission(current_user=actor, permission_key="rewards.manage"):
        return True
    try:
        program_id = uuid.UUID(entity_id)
    except ValueError:
        return False
    found = await session.scalar(
        select(Membership.id)
        .join(Program, Program.organisation_id == Membership.organisation_id)
        .where(
            Program.id == program_id,
            Membership.user_id == actor.id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Membership.role.in_(_MANAGER_ROLES),
        )
    )
    return found is not None


def register() -> None:
    registry.register_entity("rewards_account", _rewards_manager)
    registry.register_entity("rewards_program", _program_manager)
    registry.track(
        Program,
        record_type="rewards_program",
        label="Rewards programme",
    )
    registry.track(
        Entry,
        record_type="rewards_entry",
        entity_type="rewards_account",
        entity_id_attr="account_id",
        label="Rewards entry",
    )
    registry.track(
        ReviewFlag,
        record_type="rewards_flag",
        entity_type="rewards_account",
        entity_id_attr="account_id",
        label="Rewards review flag",
    )
