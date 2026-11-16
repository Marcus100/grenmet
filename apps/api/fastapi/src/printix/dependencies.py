"""Authentication for the Printix routes (ADR-0060).

Administrator routes: a superuser with an enrolled authenticator and an
MFA-verified session (``MfaAdminUser``), plus the ``printix.manage`` permission.

Scanner routes: the pairing secret in ``Authorization: Bearer <secret>``. The
header is read here, the secret is hashed and compared in the service, and no
user account is involved.

Organiser routes (``/printix/org``, ADR-0060 organiser amendment): an organisation
member signed in to the ``printix`` app, holding one of the Printix organisation
keys, with an enrolled authenticator and a session that passed it, every time.
No superuser bypass.
"""

import logging
import uuid
from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Security, status
from fastapi.concurrency import run_in_threadpool
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials
from limits import parse

from src.auth import privileged_mfa
from src.auth.models import User
from src.auth.policy import require_permission
from src.dependencies import MfaAdminUser, SessionDep, TokenDep
from src.exceptions import AppException
from src.organisations.dependencies import (
    OrgContext,
    require_org_any_permission,
    resolve_org_caller,
)
from src.rate_limit import limiter

from . import constants, service
from .models import PrintixPairing

#: The app whose session organisers sign in with (``src/auth/apps.py``).
ORGANISER_APP = "printix"

logger = logging.getLogger(__name__)

_pairing_header = APIKeyHeader(
    name="Authorization",
    scheme_name="PrintixPairing",
    auto_error=False,
    description="The pairing secret from the pairing QR code: `Bearer <secret>`.",
)


def secret_from_header(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer":
        return None
    return token.strip() or None


async def current_pairing(
    session: SessionDep,
    authorization: Annotated[str | None, Security(_pairing_header)],
) -> PrintixPairing:
    return await service.authenticate_pairing(
        session, secret_from_header(authorization)
    )


PairingDep = Annotated[PrintixPairing, Depends(current_pairing)]


async def require_printix_admin(admin: MfaAdminUser) -> User:
    """A superuser with two-step sign-in, holding the Printix key (which a superuser has)."""
    require_permission(
        current_user=admin, permission_key=constants.MANAGE_PERMISSION_KEY
    )
    return admin


PrintixAdmin = Annotated[User, Depends(require_printix_admin)]


#: Per signed-in organiser, per bucket (reads, writes). Counted after the key and the
#: authenticator checks, so a refused caller uses none of it.
ORGANISER_READS_PER_MINUTE = "120/minute"
ORGANISER_WRITES_PER_MINUTE = "30/minute"


async def _within_organiser_limit(limit: str, bucket: str, user_id: uuid.UUID) -> None:
    if not limiter.enabled:
        return
    try:
        allowed = await run_in_threadpool(
            limiter.limiter.hit, parse(limit), "printix-organiser", bucket, str(user_id)
        )
    except Exception:  # the limiter's backend (Redis) is down: serve, but say so
        logger.warning(
            "Printix organiser rate limiter unavailable; allowing the request"
        )
        return
    if not allowed:
        raise AppException(
            "Too many requests; slow down", status.HTTP_429_TOO_MANY_REQUESTS
        )


def require_printix_organiser(
    *permission_keys: str,
    limit: str = ORGANISER_READS_PER_MINUTE,
    bucket: str = "reads",
) -> Callable[..., Awaitable[OrgContext]]:
    """An organisation member who holds one of ``permission_keys``, signed in to the
    Printix app with a session that passed the authenticator.

    Membership, role, entitlement and key are checked first (``require_org_any_permission``),
    so a non-member gets the same 404 as for an unknown organisation, before any
    authenticator check. The MFA check then runs on every call, whatever
    ``AUTH_PRIVILEGED_MFA_MODE`` says: a gate pairing is a key to the gate. Then the
    caller's per-user limit for ``bucket`` (``limit``) applies."""
    permitted = require_org_any_permission(permission_keys, session_app=ORGANISER_APP)

    async def dependency(
        session: SessionDep,
        token: TokenDep,
        context: Annotated[OrgContext, Depends(permitted)],
    ) -> OrgContext:
        await privileged_mfa.require_mfa_session(
            session, context.user, token=token, app_key=ORGANISER_APP
        )
        await _within_organiser_limit(limit, bucket, context.user.id)
        return context

    return dependency


PrintixOrgEventReader = Annotated[
    OrgContext,
    Depends(
        require_printix_organiser(
            constants.EVENTS_MANAGE_KEY, constants.GATES_MANAGE_KEY
        )
    ),
]


async def require_printix_app_user(session: SessionDep, token: TokenDep) -> User:
    """The signed-in user of a ``printix`` app session that passed the authenticator.

    Used by the ``me`` routes, which name no organisation. Another app's token is 401
    (``resolve_org_caller``); an account session is refused by the authenticator check,
    because its session belongs to no app."""
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
    user, _ = await resolve_org_caller(session, credentials, ORGANISER_APP)
    await privileged_mfa.require_mfa_session(
        session, user, token=token, app_key=ORGANISER_APP
    )
    return user


PrintixAppUser = Annotated[User, Depends(require_printix_app_user)]


#: Organiser routes, by the one key each needs (ADR-0060 amendment, decision 3).
PrintixOrgEventsReadAccess = Annotated[
    OrgContext,
    Depends(
        require_printix_organiser(
            constants.EVENTS_MANAGE_KEY,
            limit=ORGANISER_READS_PER_MINUTE,
            bucket="reads",
        )
    ),
]
PrintixOrgEventsWriteAccess = Annotated[
    OrgContext,
    Depends(
        require_printix_organiser(
            constants.EVENTS_MANAGE_KEY,
            limit=ORGANISER_WRITES_PER_MINUTE,
            bucket="writes",
        )
    ),
]
PrintixOrgGatesReadAccess = Annotated[
    OrgContext,
    Depends(
        require_printix_organiser(
            constants.GATES_MANAGE_KEY,
            limit=ORGANISER_READS_PER_MINUTE,
            bucket="reads",
        )
    ),
]
PrintixOrgGatesWriteAccess = Annotated[
    OrgContext,
    Depends(
        require_printix_organiser(
            constants.GATES_MANAGE_KEY,
            limit=ORGANISER_WRITES_PER_MINUTE,
            bucket="writes",
        )
    ),
]
