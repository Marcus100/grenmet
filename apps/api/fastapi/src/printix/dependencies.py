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

from collections.abc import Awaitable, Callable
from typing import Annotated

from fastapi import Depends, Security
from fastapi.security import APIKeyHeader, HTTPAuthorizationCredentials

from src.auth import privileged_mfa
from src.auth.models import User
from src.auth.policy import require_permission
from src.dependencies import MfaAdminUser, SessionDep, TokenDep
from src.organisations.dependencies import (
    OrgContext,
    require_org_any_permission,
    resolve_org_caller,
)

from . import constants, service
from .models import PrintixPairing

#: The app whose session organisers sign in with (``src/auth/apps.py``).
ORGANISER_APP = "printix"

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


def require_printix_organiser(
    *permission_keys: str,
) -> Callable[..., Awaitable[OrgContext]]:
    """An organisation member who holds one of ``permission_keys``, signed in to the
    Printix app with a session that passed the authenticator.

    Membership, role, entitlement and key are checked first (``require_org_any_permission``),
    so a non-member gets the same 404 as for an unknown organisation, before any
    authenticator check. The MFA check then runs on every call, whatever
    ``AUTH_PRIVILEGED_MFA_MODE`` says: a gate pairing is a key to the gate."""
    permitted = require_org_any_permission(permission_keys, session_app=ORGANISER_APP)

    async def dependency(
        session: SessionDep,
        token: TokenDep,
        context: Annotated[OrgContext, Depends(permitted)],
    ) -> OrgContext:
        await privileged_mfa.require_mfa_session(
            session, context.user, token=token, app_key=ORGANISER_APP
        )
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
