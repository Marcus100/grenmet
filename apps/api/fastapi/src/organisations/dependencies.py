"""``OrgContext``: the organisation a request acts for (ADR-0022, decision 4).

Resolution order and error contract:

1. ``X-Barrels-Organisation`` missing or blank -> 400.
2. Unknown organisation, or the caller has no active membership -> 404 with the
   same message, so an organisation's existence is never revealed to outsiders.
3. Organisation suspended -> 403.
4. Member whose role is too low for the route -> 403 (``OrgAdmin``, ``OrgOwner``).
5. Organisation not entitled to the route's app or product -> 403
   (``require_org_app``; ``org.organisation_app``, keys in ``entitlements.py``).
6. Organisation-bound permission key not held through the role or a live grant
   -> 403 (``require_org_permission``; ``grants.py``, ADR-0044).

There is deliberately no superuser bypass. A route is only organisation-isolated
if it uses one of these aliases **and** has a cross-organisation denial test.
"""

import logging
import uuid
from collections.abc import AsyncGenerator, Awaitable, Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.app_dependencies import unauthorized, user_for_app
from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.utils import ALGORITHM
from src.dependencies import (
    AccountUser,
    SessionDep,
    TokenDep,
    get_authenticated_user,
)
from src.models import TokenPayload
from src.organisations import entitlements, grants, role_bundles, service
from src.organisations.exceptions import (
    OrganisationContextRequiredError,
    OrganisationNotFoundError,
    OrganisationPermissionError,
)
from src.organisations.models import Membership, MembershipRole, PlatformOrganisation
from src.request_context import bind_organisation_id, reset_organisation_id

logger = logging.getLogger(__name__)

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


def decode_bearer(credentials: HTTPAuthorizationCredentials) -> TokenPayload:
    """Validate a bearer JWT and return its payload with a UUID ``sub`` (401 else)."""
    try:
        payload = TokenPayload(
            **jwt.decode(
                credentials.credentials,
                auth_settings.SECRET_KEY,
                algorithms=[ALGORITHM],
            )
        )
        uuid.UUID(payload.sub or "")
    except InvalidTokenError, ValidationError, ValueError:
        raise unauthorized() from None
    return payload


async def resolve_org_caller(
    session: AsyncSession,
    credentials: HTTPAuthorizationCredentials | None,
    allowed_app: str | None = None,
) -> tuple[User, str | None]:
    """The signed-in user behind a bearer token, and the token's app (or ``None``).

    An account token (no ``app`` claim) resolves like ``AccountUser``. A token whose
    ``app`` claim equals ``allowed_app`` resolves through ``user_for_app`` (active
    account holding ``app.<key>.access``). Any app-scoped token whose app is not
    ``allowed_app`` is refused with 401, and so is every app-scoped token when
    ``allowed_app`` is ``None``. Membership, role and entitlement checks stay with
    the caller (``resolve_org_context`` and friends). Audited changes in the request
    are attributed to the resolved user on both paths.

    Same decode as ``storage.dependencies.resolve_caller`` (which accepts any app's
    token); both use ``decode_bearer``."""
    if credentials is None:
        raise unauthorized("Not authenticated")
    payload = decode_bearer(credentials)
    if payload.app is None:
        user = await get_authenticated_user(
            session, uuid.UUID(payload.sub or ""), allow_unapproved=True
        )
        return user, None
    if allowed_app is None or payload.app != allowed_app:
        raise unauthorized("This sign-in is limited to another app")
    user = await user_for_app(session, credentials, payload.app)
    # get_authenticated_user does this for account tokens.
    audit_service.set_actor(session, user.id)
    return user, payload.app


@contextmanager
def bound_organisation(organisation_id: str) -> Iterator[None]:
    """Bind ``organisation_id`` to the request's log context for the block."""
    token = bind_organisation_id(organisation_id)
    try:
        yield
    finally:
        try:
            reset_organisation_id(token)
        except ValueError:
            # Teardown ran in a different context; the request task is ending.
            pass


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
    with bound_organisation(context.organisation.id):
        yield context


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
    app_key: str,
    minimum: MembershipRole = MembershipRole.MEMBER,
    *,
    session_app: str | None = None,
) -> Callable[..., Awaitable[OrgContext] | AsyncGenerator[OrgContext]]:
    """Build a dependency that resolves ``OrgContext``, enforces a minimum role and
    requires the organisation's entitlement to ``app_key``.

    The entitlement is checked last, after membership is proven, so its 403
    reveals nothing to outsiders.

    ``session_app`` opts the route family in to the app-scoped session of that app
    (a JWT whose ``app`` claim equals it); every other app's token stays 401."""
    if not entitlements.is_known(app_key):
        raise ValueError(f"Unknown entitlement key: {app_key}")

    if session_app is not None:

        async def app_dependency(
            session: SessionDep,
            token: TokenDep,
            organisation: Annotated[
                str | None,
                Header(
                    alias=ORGANISATION_HEADER,
                    description=(
                        "Id of the organisation the request acts for. The caller "
                        "must be an active member, signed in with an account or "
                        f"the {session_app} app."
                    ),
                ),
            ] = None,
        ) -> AsyncGenerator[OrgContext]:
            credentials = HTTPAuthorizationCredentials(
                scheme="Bearer", credentials=token
            )
            user, _ = await resolve_org_caller(session, credentials, session_app)
            context = await resolve_org_context(session, user, organisation)
            context.require_role(minimum)
            await service.require_app_enabled(
                session, organisation_id=context.organisation_id, app_key=app_key
            )
            with bound_organisation(context.organisation.id):
                yield context

        return app_dependency

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


def require_org_permission(
    permission_key: str, *, session_app: str | None = None
) -> Callable[..., Awaitable[OrgContext]]:
    """Build a dependency for an organisation-bound permission key (ADR-0044, S1).

    Resolves ``OrgContext`` and the product entitlement (``require_org_app`` for the
    key's product), then checks the key against the member's effective keys
    (``grants.effective_keys``): implicit role bundle plus live grants. Never use
    ``has_permission`` / ``require_permission`` for these keys; they deny them.
    No superuser bypass. ``session_app`` is passed through to ``require_org_app``.
    """
    if not grants.is_product_key(permission_key):
        raise ValueError(f"Not an organisation-bound product key: {permission_key}")
    product = role_bundles.product_of_key(permission_key)
    base = require_org_app(product, MembershipRole.MEMBER, session_app=session_app)

    async def dependency(
        session: SessionDep, context: Annotated[OrgContext, Depends(base)]
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


OrgMember = Annotated[OrgContext, Depends(get_org_context)]
OrgAdmin = Annotated[OrgContext, Depends(require_org_role(MembershipRole.ADMIN))]
OrgOwner = Annotated[OrgContext, Depends(require_org_role(MembershipRole.OWNER))]
