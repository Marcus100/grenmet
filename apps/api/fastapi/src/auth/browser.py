"""Opt-in browser authentication; existing bearer-only endpoints are unchanged."""

import hashlib
import hmac
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.security import APIKeyCookie, HTTPAuthorizationCredentials, HTTPBearer

from src.config import settings
from src.dependencies import SessionDep, get_authenticated_user, get_current_user
from src.models import BaseModel

from . import service
from .config import auth_settings
from .models import User

cookie_scheme = APIKeyCookie(name=auth_settings.SESSION_COOKIE_NAME, auto_error=False)
bearer_scheme = HTTPBearer(auto_error=False)
CookieSecret = Annotated[str | None, Depends(cookie_scheme)]
BearerCredential = Annotated[
    HTTPAuthorizationCredentials | None, Depends(bearer_scheme)
]
router = APIRouter(tags=["browser-auth"])


def csrf_token(secret: str) -> str:
    return hmac.new(
        auth_settings.SECRET_KEY.encode(),
        ("browser-csrf:" + secret).encode(),
        hashlib.sha256,
    ).hexdigest()


async def get_cookie_user(
    request: Request, session: SessionDep, secret: CookieSecret
) -> User:
    if not secret:
        raise HTTPException(401, "Sign in again")
    stored = await service.get_active_session_by_secret(
        session=session, session_secret=secret
    )
    if stored is None:
        raise HTTPException(401, "Sign in again")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        supplied = request.headers.get("x-csrf-token", "")
        if not hmac.compare_digest(supplied.encode(), csrf_token(secret).encode()):
            raise HTTPException(403, "Invalid CSRF token")
        origin = request.headers.get("origin")
        if origin is not None and origin not in settings.all_cors_origins:
            raise HTTPException(403, "Untrusted request origin")
    return await get_authenticated_user(session, stored.user_id)


async def get_browser_or_token_user(
    request: Request,
    session: SessionDep,
    secret: CookieSecret,
    bearer: BearerCredential,
) -> User:
    # Never downgrade a supplied invalid Authorization header to cookie credentials.
    if "authorization" in request.headers:
        if bearer is None:
            raise HTTPException(401, "Invalid authorization header")
        return await get_current_user(session, bearer.credentials)
    return await get_cookie_user(request, session, secret)


BrowserUser = Annotated[User, Depends(get_browser_or_token_user)]
CookieUser = Annotated[User, Depends(get_cookie_user)]


class BrowserSession(BaseModel):
    userId: UUID
    csrfToken: str


@router.get("/auth/browser/session", response_model=BrowserSession)
async def browser_session(
    user: CookieUser, secret: CookieSecret, response: Response
) -> BrowserSession:
    """Validate the cookie and return a session-bound CSRF token, never the session secret."""
    response.headers["Cache-Control"] = "no-store"
    response.headers["Vary"] = "Cookie"
    assert secret is not None
    return BrowserSession(userId=user.id, csrfToken=csrf_token(secret))
