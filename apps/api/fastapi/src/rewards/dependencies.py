from typing import Annotated

from fastapi import Depends

from src.auth.models import User
from src.auth.policy import require_permission
from src.dependencies import CurrentUser
from src.organisations.api_key_auth import OrgAccess, org_or_key
from src.organisations.dependencies import OrgContext, require_org_app
from src.organisations.models import MembershipRole


async def get_rewards_manager(current_user: CurrentUser) -> User:
    """Superusers and holders of ``rewards.manage``."""
    require_permission(current_user=current_user, permission_key="rewards.manage")
    return current_user


RewardsManager = Annotated[User, Depends(get_rewards_manager)]


# Organisation routes require the "rewards" entitlement (org.organisation_app).
RewardsOrgMember = Annotated[OrgContext, Depends(require_org_app("rewards"))]
RewardsOrgAdmin = Annotated[
    OrgContext, Depends(require_org_app("rewards", MembershipRole.ADMIN))
]
# Programme reads and redemption confirmation also accept an API key (PF5,
# ADR-0029) with `rewards.read` / `rewards.write`, e.g. a till or kiosk.
RewardsOrgRead = Annotated[OrgAccess, Depends(org_or_key("rewards", "rewards.read"))]
RewardsOrgStaff = Annotated[OrgAccess, Depends(org_or_key("rewards", "rewards.write"))]
