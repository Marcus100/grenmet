"""Route gating by flag. 404 when off, so a dark feature looks like it does not exist."""

from collections.abc import Awaitable, Callable

from src.dependencies import SessionDep
from src.organisations.dependencies import OrgContext, OrgMember

from . import service
from .exceptions import FeatureOffError


def require_flag(key: str) -> Callable[..., Awaitable[None]]:
    """Dependency for routes with no subject: only audience rules that need no
    organisation or user (everyone, environments) can turn it on.

    Use as ``dependencies=[Depends(require_flag("my-flag"))]``.
    """

    async def dependency(session: SessionDep) -> None:
        if not await service.is_enabled(session, key):
            raise FeatureOffError()

    return dependency


def require_org_flag(key: str) -> Callable[..., Awaitable[OrgContext]]:
    """Like ``require_flag`` but evaluated for the caller's organisation and user.
    Membership is resolved first, so a non-member never learns the flag state."""

    async def dependency(session: SessionDep, context: OrgMember) -> OrgContext:
        if not await service.is_enabled(
            session,
            key,
            organisation_id=context.organisation_id,
            user_id=context.user.id,
        ):
            raise FeatureOffError()
        return context

    return dependency
