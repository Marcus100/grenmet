"""Permission dependencies for commerce routes (ADR-0044, ADR-0063).

Organisation-bound keys are resolved through ``grants.has_org_permission``, which
intersects the member's keys with the organisation's entitlements. The global
``require_permission`` denies these keys on purpose, and superusers get nothing
here. ``require_org_permission`` is not used because it insists the key's product
is a registered entitlement in ``entitlements.PRODUCTS``, which this slice keeps
out of (see ``constants.APP_KEY``).
"""

import logging
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends

from src.commerce.constants import CATALOGUE_MANAGE_KEY, SELL_KEY
from src.dependencies import SessionDep
from src.organisations import grants
from src.organisations.dependencies import OrgContext, get_org_context
from src.organisations.exceptions import OrganisationPermissionError

logger = logging.getLogger(__name__)


def require_commerce_permission(
    permission_key: str,
) -> Callable[..., Awaitable[OrgContext]]:
    if not grants.is_product_key(permission_key):
        raise ValueError(f"Not an organisation-bound key: {permission_key}")

    async def dependency(
        session: SessionDep,
        context: Annotated[OrgContext, Depends(get_org_context)],
    ) -> OrgContext:
        if not await grants.has_org_permission(
            session, membership=context.membership, permission_key=permission_key
        ):
            logger.warning(
                "Organisation permission denied",
                extra={
                    "user_id": str(context.user.id),
                    "organisation_id": context.organisation_id,
                    "permission_key": permission_key,
                },
            )
            raise OrganisationPermissionError()
        return context

    return dependency


CommerceSeller = Annotated[OrgContext, Depends(require_commerce_permission(SELL_KEY))]
CommerceCatalogueManager = Annotated[
    OrgContext, Depends(require_commerce_permission(CATALOGUE_MANAGE_KEY))
]
