"""Change history for feature flags, readable by flag managers (superusers always)."""

from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import registry
from src.auth.models import User
from src.auth.policy import has_permission

from .models import FeatureFlag

PERMISSION = "feature_flags.manage"


async def _flag_manager(_session: AsyncSession, actor: User, _entity_id: str) -> bool:
    return has_permission(current_user=actor, permission_key=PERMISSION)


def register() -> None:
    registry.register_entity("feature_flag", _flag_manager)
    registry.track(FeatureFlag, record_type="feature_flag", label="Feature flag")
