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
from fastapi import Depends, Header, HTTPException, status
from fastapi.concurrency import run_in_threadpool
from fastapi.security import HTTPAuthorizationCredentials
from jwt.exceptions import InvalidTokenError
from limits import parse
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth import privileged_mfa
from src.auth.app_dependencies import unauthorized, user_for_app
from src.auth.config import auth_settings
from src.auth.eligibility import is_eligible_for_app
from src.auth.models import User
from src.auth.permissions import EVENTS_OPS_KEYS
from src.auth.policy import has_role_permission
from src.auth.utils import ALGORITHM
from src.dependencies import (
    AccountUser,
    SessionDep,
    TokenDep,
    get_authenticated_user,
)
from src.models import TokenPayload
from src.organisations import entitlements, grants, role_bundles, service
from src.organisations.capacity import ACTOR_CAPACITY_KEY, Capacity
from src.organisations.exceptions import (
    OrganisationAppNotEntitledError,
    OrganisationContextRequiredError,
    OrganisationNotFoundError,
    OrganisationPermissionError,
    OrganisationSuspendedError,
)
from src.organisations.models import (
    Membership,
    MembershipRole,
    OrganisationStatus,
    PlatformOrganisation,
)
from src.rate_limit import limiter
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


# Staff keys whose use needs a session that passed two-step verification. The door
# key is the exception: volunteers scan tickets without an authenticator.
STAFF_MFA_KEYS = frozenset(EVENTS_OPS_KEYS) - {"events.ops.door"}


#: Each dependency built by ``require_org_permission_or_staff`` -> its key pair.
STAFF_KEY_PAIRS: dict[Callable[..., AsyncGenerator[EventsActor]], tuple[str, str]] = {}


@dataclass(frozen=True)
class EventsActor:
    """Who acts on an organiser's Events data: a member, or Barrels staff (ADR-0050).

    ``membership`` is ``None`` exactly when ``capacity`` is ``"staff"``."""

    organisation: PlatformOrganisation
    user: User
    membership: Membership | None
    capacity: Capacity

    @property
    def organisation_id(self) -> str:
        return self.organisation.id

    @property
    def is_staff(self) -> bool:
        return self.capacity == "staff"

    @property
    def role(self) -> MembershipRole | None:
        return MembershipRole(self.membership.role) if self.membership else None


async def require_staff_session_mfa(
    session: AsyncSession, user: User, *, token: str, token_app: str | None
) -> None:
    """Two-step verification for a staff key, whatever ``AUTH_PRIVILEGED_MFA_MODE`` says.

    ``token_app`` is the app claim of the bearer token: an app session is checked
    against that app's login session, an account session against an account one."""
    await privileged_mfa.require_mfa_session(
        session, user, token=token, app_key=token_app
    )


async def _within_staff_limit(limit: str, bucket: str, user_id: uuid.UUID) -> None:
    if not limiter.enabled:
        return
    if not await run_in_threadpool(
        limiter.limiter.hit, parse(limit), "events-staff", bucket, str(user_id)
    ):
        logger.warning(
            "Staff write rate limit hit",
            extra={"user_id": str(user_id), "permission_key": bucket},
        )
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests; slow down"
        )


async def has_staff_access(session: AsyncSession, user: User, staff_key: str) -> bool:
    """The staff key through a role, and the Events app (``app.events.access``).

    Checked explicitly so a custom role with only an ops key cannot skip the app
    gate on an account token."""
    return await has_role_permission(
        session=session, user=user, permission_key=staff_key
    ) and await is_eligible_for_app(session=session, user=user, app_key="events")


def require_org_permission_or_staff(
    org_key: str,
    staff_key: str,
    *,
    session_app: str | None = "events",
    staff_limit: str | None = None,
) -> Callable[..., AsyncGenerator[EventsActor]]:
    """Dependency for an org-zone route a member OR Barrels staff may use (ADR-0050).

    Member path first: a caller with an active membership who holds ``org_key``
    (``grants.has_org_permission``) is a member call, unchanged from
    ``require_org_permission``. Otherwise the staff path: the caller holds
    ``staff_key`` through a role assignment (``policy.has_role_permission``; a
    superuser has no implicit key), then the named organisation must exist (404
    when not: a missing key and an unknown organisation answer alike), be active
    (403) and hold the product entitlement (403). Keys in ``STAFF_MFA_KEYS`` also
    need a session that passed two-step verification (403), checked before the
    organisation is looked up. ``staff_limit`` ("20/minute") limits staff-path
    calls per user and staff key. A member who holds neither key keeps the member
    denial (403). Sets ``session.info['events.actor_capacity']``."""
    if not grants.is_product_key(org_key):
        raise ValueError(f"Not an organisation-bound product key: {org_key}")
    if staff_key not in EVENTS_OPS_KEYS:
        raise ValueError(f"Not a staff key: {staff_key}")
    product = role_bundles.product_of_key(org_key)
    if not entitlements.is_known(product):
        raise ValueError(f"Unknown entitlement key: {product}")

    async def dependency(
        session: SessionDep,
        token: TokenDep,
        organisation: Annotated[
            str | None,
            Header(
                alias=ORGANISATION_HEADER,
                description=(
                    "Id of the organisation the request acts for. The caller must "
                    "be an active member holding the organisation key, or Barrels "
                    "staff holding the staff key."
                ),
            ),
        ] = None,
    ) -> AsyncGenerator[EventsActor]:
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        user, token_app = await resolve_org_caller(session, credentials, session_app)
        organisation_id = (organisation or "").strip()
        if not organisation_id:
            raise OrganisationContextRequiredError()
        if len(organisation_id) > _MAX_ID_LENGTH:
            raise OrganisationNotFoundError()

        member_denial: Exception | None = None
        found = await service.find_membership(
            session, user_id=user.id, organisation_id=organisation_id
        )
        if found is not None:
            if found.organisation.status != OrganisationStatus.ACTIVE.value:
                raise OrganisationSuspendedError()
            if not await service.is_app_enabled(
                session, organisation_id=organisation_id, app_key=product
            ):
                member_denial = OrganisationAppNotEntitledError()
            elif await grants.has_org_permission(
                session, membership=found.membership, permission_key=org_key
            ):
                session.info[ACTOR_CAPACITY_KEY] = "member"
                with bound_organisation(organisation_id):
                    yield EventsActor(
                        organisation=found.organisation,
                        user=user,
                        membership=found.membership,
                        capacity="member",
                    )
                return
            else:
                member_denial = OrganisationPermissionError()

        if not await has_staff_access(session, user, staff_key):
            if member_denial is not None:
                logger.warning(
                    "Organisation permission denied",
                    extra={
                        "user_id": str(user.id),
                        "organisation_id": organisation_id,
                        "permission_key": org_key,
                    },
                )
                raise member_denial
            raise OrganisationNotFoundError()
        if staff_key in STAFF_MFA_KEYS:
            await require_staff_session_mfa(
                session, user, token=token, token_app=token_app
            )
        target = found.organisation if found else None
        if target is None:
            target = await session.get(PlatformOrganisation, organisation_id)
        if target is None:
            raise OrganisationNotFoundError()
        if target.status != OrganisationStatus.ACTIVE.value:
            raise OrganisationSuspendedError()
        await service.require_app_enabled(
            session, organisation_id=organisation_id, app_key=product
        )
        if staff_limit is not None:
            await _within_staff_limit(staff_limit, staff_key, user.id)
        session.info[ACTOR_CAPACITY_KEY] = "staff"
        with bound_organisation(organisation_id):
            yield EventsActor(
                organisation=target, user=user, membership=None, capacity="staff"
            )

    # Read by the route registry test (tests/events/test_staff_ops.py).
    STAFF_KEY_PAIRS[dependency] = (org_key, staff_key)
    return dependency


def _team_manage_keys() -> frozenset[str]:
    return frozenset(k for k in grants.product_keys() if k.endswith(".team.manage"))


async def get_org_team_manager(
    session: SessionDep, context: Annotated[OrgContext, Depends(get_org_context)]
) -> OrgContext:
    """Organisation member who holds some entitled product's ``team.manage`` key
    (owner and admin implicitly; a member through a granted bundle) - ADR-0044, S3.

    The key is per product, so the route family cannot name one: this gates entry,
    and ``grants.grant_role`` / ``revoke_grant`` then require the specific product's
    ``team.manage`` for the bundle being changed. Entitlement is part of
    ``effective_keys``. No superuser bypass."""
    held = await grants.effective_keys(session, membership=context.membership)
    if not held & _team_manage_keys():
        logger.warning(
            "Organisation permission denied",
            extra={
                "user_id": str(context.user.id),
                "organisation_id": context.organisation_id,
                "permission_key": "team.manage",
            },
        )
        raise OrganisationPermissionError()
    return context


OrgMember = Annotated[OrgContext, Depends(get_org_context)]
OrgTeamManager = Annotated[OrgContext, Depends(get_org_team_manager)]
OrgAdmin = Annotated[OrgContext, Depends(require_org_role(MembershipRole.ADMIN))]
OrgOwner = Annotated[OrgContext, Depends(require_org_role(MembershipRole.OWNER))]
