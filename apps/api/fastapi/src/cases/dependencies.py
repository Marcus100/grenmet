"""Who may call a case-engine route (ADR-0069 decision 2).

The programme is part of the path (``/cases/org/safety/...``). Each programme is
its own product with its own organisation keys, so the key a route needs is
``<programme>.<suffix>`` and is only known per request. ``require_case_permission``
applies the same rules as ``require_org_permission``, in the same order:
membership (404 to outsiders), then the programme's entitlement (403), then the
key (403). No superuser bypass. A programme that is not built yet is 404.
"""

import logging
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Path

from src.dependencies import SessionDep
from src.organisations import entitlements, grants
from src.organisations import service as org_service
from src.organisations.dependencies import OrgContext, get_org_context
from src.organisations.exceptions import OrganisationPermissionError

from .exceptions import CaseProgrammeNotFoundError
from .models import Programme

logger = logging.getLogger(__name__)

#: Path value (kebab-case) to programme.
PROGRAMME_PATHS: dict[str, Programme] = {
    programme.value.replace("_", "-"): programme for programme in Programme
}


@dataclass(frozen=True)
class CaseContext:
    org: OrgContext
    programme: Programme

    @property
    def organisation_id(self) -> str:
        return self.org.organisation_id

    def key(self, suffix: str) -> str:
        return f"{self.programme.value}.{suffix}"


def available_programmes() -> list[Programme]:
    """Programmes that are products today (the others answer 404)."""
    return [p for p in Programme if p.value in entitlements.PRODUCTS]


async def has_key(session: SessionDep, context: CaseContext, suffix: str) -> bool:
    return await grants.has_org_permission(
        session, membership=context.org.membership, permission_key=context.key(suffix)
    )


def require_case_permission(suffix: str) -> Callable[..., Awaitable[CaseContext]]:
    """Build the dependency for ``<programme>.<suffix>``, e.g. ``cases.read``."""

    async def dependency(
        session: SessionDep,
        org: Annotated[OrgContext, Depends(get_org_context)],
        programme: Annotated[
            str,
            Path(
                description="The programme: safety.",
                pattern=r"^[a-z]+(-[a-z]+)*$",
                max_length=40,
            ),
        ],
    ) -> CaseContext:
        found = PROGRAMME_PATHS.get(programme)
        if found is None or found.value not in entitlements.PRODUCTS:
            raise CaseProgrammeNotFoundError()
        await org_service.require_app_enabled(
            session, organisation_id=org.organisation_id, app_key=found.value
        )
        context = CaseContext(org=org, programme=found)
        if not await has_key(session, context, suffix):
            logger.warning(
                "Organisation permission denied",
                extra={
                    "user_id": str(org.user.id),
                    "organisation_id": org.organisation_id,
                    "permission_key": context.key(suffix),
                },
            )
            raise OrganisationPermissionError()
        return context

    return dependency
