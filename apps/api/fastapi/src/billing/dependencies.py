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


async def get_app_subscription_manager(current_user: CurrentUser) -> User:
    """Holders of ``billing.subscriptions.manage`` (superusers always). Checked before
    the organisation role, so a caller without the key gets 403 whatever their role."""
    require_permission(
        current_user=current_user, permission_key="billing.subscriptions.manage"
    )
    return current_user


AppSubscriptionManager = Annotated[User, Depends(get_app_subscription_manager)]
