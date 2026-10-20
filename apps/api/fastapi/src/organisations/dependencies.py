"""``OrgContext``: the organisation a request acts for (ADR-0022, decision 4).

Resolution order and error contract:

1. ``X-Barrels-Organisation`` missing or blank -> 400.
2. Unknown organisation, or the caller has no active membership -> 404 with the
   same message, so an organisation's existence is never revealed to outsiders.
3. Organisation suspended -> 403.
4. Member whose role is too low for the route -> 403 (``OrgAdmin``, ``OrgOwner``).
5. Organisation not entitled to the route's app or product -> 403
   (``require_org_app``; ``org.organisation_app``, keys in ``entitlements.py``).

There is deliberately no superuser bypass. A route is only organisation-isolated
if it uses one of these aliases **and** has a cross-organisation denial test.
"""

from collections.abc import AsyncGenerator, Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.dependencies import AccountUser, SessionDep
from src.organisations import entitlements, service
from src.organisations.exceptions import (
    OrganisationContextRequiredError,
    OrganisationNotFoundError,
)
from src.organisations.models import Membership, MembershipRole, PlatformOrganisation
from src.request_context import bind_organisation_id, reset_organisation_id

ORGANISATION_HEADER = "X-Barrels-Organisation"
_MAX_ID_LENGTH = 100


@dataclass(frozen=True)
class OrgContext:
    """The resolved organisation, the caller's membership in it, and the caller."""

    organisation: PlatformOrganisation
    membership: Membership
    user: User

    @property
    def organisation_id(self) -> str:
        return self.organisation.id

    @property
    def role(self) -> MembershipRole:
        return MembershipRole(self.membership.role)

    def require_role(self, minimum: MembershipRole) -> None:
        """Raise 403 unless the caller's role is at least ``minimum``."""
        service.require_role(self.membership.role, minimum)


async def resolve_org_context(
    session: AsyncSession, user: User, organisation: str | None
) -> OrgContext:
    """Resolve the header value for ``user``; shared by every route family that
    needs the same denial rules (including ones that accept app-scoped tokens)."""
    organisation_id = (organisation or "").strip()
    if not organisation_id:
        raise OrganisationContextRequiredError()
    if len(organisation_id) > _MAX_ID_LENGTH:
        raise OrganisationNotFoundError()
    resolved = await service.resolve_membership(
        session, user_id=user.id, organisation_id=organisation_id
    )
    return OrgContext(
        organisation=resolved.organisation,
        membership=resolved.membership,
        user=user,
    )


async def get_org_context(
    session: SessionDep,
    current_user: AccountUser,
    organisation: Annotated[
        str | None,
        Header(
            alias=ORGANISATION_HEADER,
            description=(
                "Id of the organisation the request acts for. The caller must be "
                "an active member."
            ),
        ),
    ] = None,
) -> AsyncGenerator[OrgContext]:
    context = await resolve_org_context(session, current_user, organisation)
    token = bind_organisation_id(context.organisation.id)
    try:
        yield context
    finally:
        try:
            reset_organisation_id(token)
        except ValueError:
            # Teardown ran in a different context; the request task is ending.
            pass


def require_org_role(
    minimum: MembershipRole,
) -> Callable[..., Awaitable[OrgContext]]:
    """Build a dependency that resolves ``OrgContext`` and enforces a minimum role."""

    async def dependency(
        context: Annotated[OrgContext, Depends(get_org_context)],
    ) -> OrgContext:
        context.require_role(minimum)
        return context

    return dependency


def require_org_app(
    app_key: str, minimum: MembershipRole = MembershipRole.MEMBER
) -> Callable[..., Awaitable[OrgContext]]:
    """Build a dependency that resolves ``OrgContext``, enforces a minimum role and
    requires the organisation's entitlement to ``app_key``.

    The entitlement is checked last, after membership is proven, so its 403
    reveals nothing to outsiders."""
    if not entitlements.is_known(app_key):
        raise ValueError(f"Unknown entitlement key: {app_key}")

    async def dependency(
        session: SessionDep,
        context: Annotated[OrgContext, Depends(get_org_context)],
    ) -> OrgContext:
        context.require_role(minimum)
        await service.require_app_enabled(
            session, organisation_id=context.organisation_id, app_key=app_key
        )
        return context

    return dependency


OrgMember = Annotated[OrgContext, Depends(get_org_context)]
OrgAdmin = Annotated[OrgContext, Depends(require_org_role(MembershipRole.ADMIN))]
OrgOwner = Annotated[OrgContext, Depends(require_org_role(MembershipRole.OWNER))]
