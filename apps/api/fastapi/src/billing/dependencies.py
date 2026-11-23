from typing import Annotated

from fastapi import Depends

from src.auth.models import User
from src.auth.policy import require_permission
from src.dependencies import CurrentUser
from src.organisations.dependencies import OrgContext, require_org_role_session
from src.organisations.models import MembershipRole

from .gateway import StripeGateway, stripe_gateway


def get_stripe_gateway() -> StripeGateway:
    return stripe_gateway


StripeGatewayDep = Annotated[StripeGateway, Depends(get_stripe_gateway)]


async def get_billing_manager(current_user: CurrentUser) -> User:
    """Superusers and holders of ``billing.manage`` (invoicing control plane)."""
    require_permission(current_user=current_user, permission_key="billing.manage")
    return current_user


BillingManager = Annotated[User, Depends(get_billing_manager)]

#: Organisation admin or owner, signed in with an account or the bookings studio
#: (ADR-0065). No entitlement check: subscribing is how the app is bought.
BillingOrgAdmin = Annotated[
    OrgContext,
    Depends(require_org_role_session(MembershipRole.ADMIN, session_app="bookings")),
]
