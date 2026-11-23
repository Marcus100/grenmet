from typing import Annotated

from fastapi import Depends

from src.auth.models import User
from src.auth.policy import require_permission
from src.dependencies import CurrentUser

from .gateway import StripeGateway, stripe_gateway


def get_stripe_gateway() -> StripeGateway:
    return stripe_gateway


StripeGatewayDep = Annotated[StripeGateway, Depends(get_stripe_gateway)]


async def get_billing_manager(current_user: CurrentUser) -> User:
    """Superusers and holders of ``billing.manage`` (invoicing control plane)."""
    require_permission(current_user=current_user, permission_key="billing.manage")
    return current_user


BillingManager = Annotated[User, Depends(get_billing_manager)]
