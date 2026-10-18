"""Organisation context for upload routes.

Same denial rules as ``OrgContext`` (400 missing header, 404 non-member or
unknown, 403 suspended or too low a role), but the caller may also hold an
app-scoped session (Events). An app-scoped token may only upload for its own
app; the service enforces that against the request body.
"""

import uuid
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, Header
from jwt.exceptions import InvalidTokenError
from pydantic import ValidationError

from src.auth.app_dependencies import OptionalBearer, unauthorized, user_for_app
from src.auth.config import auth_settings
from src.auth.models import User
from src.auth.utils import ALGORITHM
from src.dependencies import SessionDep, get_authenticated_user
from src.models import TokenPayload
from src.organisations.dependencies import (
    ORGANISATION_HEADER,
    OrgContext,
    resolve_org_context,
)
from src.request_context import bind_organisation_id, reset_organisation_id


@dataclass(frozen=True)
class UploadContext:
    org: OrgContext
    #: App key of the caller's app-scoped token; None for a general account token.
    token_app: str | None

    @property
    def user(self) -> User:
        return self.org.user


async def _caller(
    session: SessionDep, credentials: OptionalBearer
) -> tuple[User, str | None]:
    if credentials is None:
        raise unauthorized("Not authenticated")
    try:
        payload = TokenPayload(
            **jwt.decode(
                credentials.credentials,
                auth_settings.SECRET_KEY,
                algorithms=[ALGORITHM],
            )
        )
        user_id = uuid.UUID(payload.sub or "")
    except InvalidTokenError, ValidationError, ValueError:
        raise unauthorized() from None
    if payload.app is None:
        user = await get_authenticated_user(session, user_id, allow_unapproved=True)
        return user, None
    return await user_for_app(session, credentials, payload.app), payload.app


async def get_upload_context(
    session: SessionDep,
    credentials: OptionalBearer,
    organisation: Annotated[
        str | None,
        Header(
            alias=ORGANISATION_HEADER,
            description="Id of the organisation the upload belongs to (active member).",
        ),
    ] = None,
) -> AsyncGenerator[UploadContext]:
    user, token_app = await _caller(session, credentials)
    context = await resolve_org_context(session, user, organisation)
    token = bind_organisation_id(context.organisation.id)
    try:
        yield UploadContext(org=context, token_app=token_app)
    finally:
        try:
            reset_organisation_id(token)
        except ValueError:
            pass


UploadMember = Annotated[UploadContext, Depends(get_upload_context)]
