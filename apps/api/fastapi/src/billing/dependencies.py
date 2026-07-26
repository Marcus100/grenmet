from typing import Annotated

from fastapi import Depends

from .gateway import StripeGateway, stripe_gateway


def get_stripe_gateway() -> StripeGateway:
    return stripe_gateway


StripeGatewayDep = Annotated[StripeGateway, Depends(get_stripe_gateway)]
