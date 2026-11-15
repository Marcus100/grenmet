"""Authentication for the Printix routes (ADR-0060).

Administrator routes: a superuser with an enrolled authenticator and an
MFA-verified session (``MfaAdminUser``), plus the ``printix.manage`` permission.

Scanner routes: the pairing secret in ``Authorization: Bearer <secret>``. The
header is read here, the secret is hashed and compared in the service, and no
user account is involved.
"""

from typing import Annotated

from fastapi import Depends, Security
from fastapi.security import APIKeyHeader

from src.auth.models import User
from src.auth.policy import require_permission
from src.dependencies import MfaAdminUser, SessionDep

from . import constants, service
from .models import PrintixPairing

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
