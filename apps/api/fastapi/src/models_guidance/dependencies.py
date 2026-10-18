"""Access rules for the models-guidance routes.

Two kinds of caller reach the data routes:

* a member of an organisation that holds the ``gmsdash`` entitlement
  (``org.organisation_app``), with the organisation in ``X-Barrels-Organisation``.
  The token is a ``gmsdash`` app session or a plain account session; the
  organisation denial rules are those of ``OrgContext`` (400/404/403);
* GMS staff holding ``gmsdash.guidance.view`` with no organisation header.

Access-request routes need membership only (an organisation asks *because*
it is not entitled yet) or, for the review side, ``gmsdash.access.review``.
"""

from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, status
from fastapi.exceptions import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import policy
from src.auth.app_dependencies import OptionalBearer
from src.auth.models import User
from src.dependencies import CurrentUser, SessionDep
from src.organisations.dependencies import (
    ORGANISATION_HEADER,
    OrgContext,
    resolve_org_context,
)
from src.request_context import bind_organisation_id, reset_organisation_id
from src.storage.dependencies import resolve_caller

from . import service
from .constants import GUIDANCE_APP_KEY
from .exceptions import NotEntitledError

PERMISSION_VIEW = "gmsdash.guidance.view"
PERMISSION_REVIEW = "gmsdash.access.review"


@dataclass(frozen=True)
class GuidanceCaller:
    user: User
    #: The acting organisation; None for GMS staff reading with a permission.
    org: OrgContext | None


def _wrong_app() -> HTTPException:
    return HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Sign in to this app to continue",
        headers={"WWW-Authenticate": "Bearer"},
    )


async def _member_context(
    session: AsyncSession, credentials: OptionalBearer, organisation: str | None
) -> OrgContext:
    user, token_app = await resolve_caller(session, credentials)
    if token_app not in (None, GUIDANCE_APP_KEY):
        raise _wrong_app()
    return await resolve_org_context(session, user, organisation)


async def get_member_user(session: SessionDep, credentials: OptionalBearer) -> User:
    """A signed-in ``gmsdash`` or account session; no organisation chosen yet."""
    user, token_app = await resolve_caller(session, credentials)
    if token_app not in (None, GUIDANCE_APP_KEY):
        raise _wrong_app()
    return user


async def get_member_context(
    session: SessionDep,
    credentials: OptionalBearer,
    organisation: Annotated[
        str | None,
        Header(
            alias=ORGANISATION_HEADER,
            description="Id of the organisation the request acts for (active member).",
        ),
    ] = None,
) -> AsyncGenerator[OrgContext]:
    context = await _member_context(session, credentials, organisation)
    token = bind_organisation_id(context.organisation.id)
    try:
        yield context
    finally:
        try:
            reset_organisation_id(token)
        except ValueError:
            pass


async def get_guidance_caller(
    session: SessionDep,
    credentials: OptionalBearer,
    organisation: Annotated[
        str | None,
        Header(
            alias=ORGANISATION_HEADER,
            description=(
                "Organisation entitled to the GMS Dashboard. Omit only when "
                "reading as GMS staff."
            ),
        ),
    ] = None,
) -> AsyncGenerator[GuidanceCaller]:
    if not (organisation or "").strip():
        user, token_app = await resolve_caller(session, credentials)
        if token_app is not None or user.registration_pending:
            raise NotEntitledError()
        policy.require_permission(current_user=user, permission_key=PERMISSION_VIEW)
        yield GuidanceCaller(user=user, org=None)
        return
    context = await _member_context(session, credentials, organisation)
    if not await service.is_entitled(session, context.organisation_id):
        raise NotEntitledError()
    token = bind_organisation_id(context.organisation.id)
    try:
        yield GuidanceCaller(user=context.user, org=context)
    finally:
        try:
            reset_organisation_id(token)
        except ValueError:
            pass


async def get_reviewer(current_user: CurrentUser) -> User:
    policy.require_permission(
        current_user=current_user, permission_key=PERMISSION_REVIEW
    )
    return current_user


GuidanceReader = Annotated[GuidanceCaller, Depends(get_guidance_caller)]
GuidanceMember = Annotated[User, Depends(get_member_user)]
GuidanceOrgMember = Annotated[OrgContext, Depends(get_member_context)]
GuidanceReviewer = Annotated[User, Depends(get_reviewer)]
