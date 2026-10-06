"""App-scoped sign-in routes: /api/v1/auth/apps/{app}/... (ADR-0016).

Each self-service app (Barrels Events first) signs people in on its own pages
and keeps its own session cookie. Every route here is intentionally public
and rate-limited; proof of ownership (a code or Google) is required to
establish a session.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Path, status
from starlette.requests import Request

from src.auth import app_service
from src.auth.app_dependencies import OptionalBearer, unauthorized, user_for_app
from src.auth.app_schemas import (
    AppEmailCodeStart,
    AppEmailCodeVerify,
    AppPasswordLogin,
    AppPhoneCodeStart,
    AppPhoneCodeVerify,
    AppPublic,
)
from src.auth.apps import AppDefinition, get_app
from src.auth.models import User
from src.auth.modern_schemas import (
    GoogleChallengePublic,
    GoogleComplete,
    GoogleFinish,
    GoogleStart,
    GoogleStartPublic,
)
from src.auth.schemas import SessionLoginResponse
from src.dependencies import SessionDep
from src.models import Message
from src.rate_limit import limiter

router = APIRouter(prefix="/auth/apps/{app}", tags=["auth"])


def _app(app: Annotated[str, Path(pattern="^[a-z][a-z0-9-]{1,30}$")]) -> AppDefinition:
    return get_app(app)


AppDep = Annotated[AppDefinition, Depends(_app)]


async def _member(
    session: SessionDep, app: AppDep, credentials: OptionalBearer
) -> User:
    """Signed in to the app named in the path."""
    if credentials is None:
        raise unauthorized()
    return await user_for_app(session, credentials, app.key)


AppMember = Annotated[User, Depends(_member)]

_PUBLIC: dict[int | str, dict[str, Any]] = {
    404: {"description": "Unknown app"},
    429: {"description": "Rate limit exceeded"},
}
_SIGN_IN: dict[int | str, dict[str, Any]] = {
    **_PUBLIC,
    400: {"description": "Wrong or expired code, or bad credentials"},
    403: {"description": "Account cannot use this app"},
    503: {"description": "Sign-in method not available"},
}


@router.get(
    "",
    response_model=AppPublic,
    status_code=status.HTTP_200_OK,
    summary="Describe an app's sign-in options",
    description="Public: which sign-in methods the app offers and whether anyone may sign up.",
    responses={404: {"description": "Unknown app"}},
)
async def get_app_sign_in_options(*, app: AppDep) -> AppPublic:
    return AppPublic(
        key=app.key,
        label=app.label,
        self_signup=app.self_signup,
        methods=sorted(app.methods),
    )


@router.post(
    "/email-code/start",
    response_model=Message,
    status_code=status.HTTP_200_OK,
    summary="Send an email sign-in code",
    description="Send a 6-digit code. The reply never reveals whether the address has an account.",
    responses=_SIGN_IN,
)
@limiter.limit("5/minute")
async def app_email_code_start(
    *, request: Request, session: SessionDep, app: AppDep, body: AppEmailCodeStart
) -> Message:
    _ = request
    return await app_service.email_code_start(session=session, app=app, body=body)


@router.post(
    "/email-code/verify",
    response_model=SessionLoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in with an email code",
    description="Verify the code and create an app-scoped session; creates the account on first sign-in when the app allows sign-up.",
    responses=_SIGN_IN,
)
@limiter.limit("10/minute")
async def app_email_code_verify(
    *, request: Request, session: SessionDep, app: AppDep, body: AppEmailCodeVerify
) -> SessionLoginResponse:
    return await app_service.email_code_verify(
        request=request, session=session, app=app, body=body
    )


@router.post(
    "/login",
    response_model=SessionLoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in with email and password",
    description="Create an app-scoped session with an email and password.",
    responses=_SIGN_IN,
)
@limiter.limit("10/minute")
async def app_password_login(
    *, request: Request, session: SessionDep, app: AppDep, body: AppPasswordLogin
) -> SessionLoginResponse:
    return await app_service.password_login(
        request=request, session=session, app=app, body=body
    )


@router.post(
    "/google/start",
    response_model=GoogleStartPublic,
    status_code=status.HTTP_200_OK,
    summary="Start Google sign-in for an app",
    description="Return the Google authorisation URL using this app's redirect URI.",
    responses=_SIGN_IN,
)
@limiter.limit("10/minute")
async def app_google_start(
    *, request: Request, session: SessionDep, app: AppDep, body: GoogleStart
) -> GoogleStartPublic:
    _ = request
    return await app_service.google_start(session=session, app=app, body=body)


@router.post(
    "/google/complete",
    response_model=GoogleChallengePublic,
    status_code=status.HTTP_200_OK,
    summary="Verify the Google callback for an app",
    description="Verify Google's callback and return a short-lived challenge to finish sign-in.",
    responses=_SIGN_IN,
)
@limiter.limit("10/minute")
async def app_google_complete(
    *, request: Request, session: SessionDep, app: AppDep, body: GoogleComplete
) -> GoogleChallengePublic:
    _ = request
    return await app_service.google_complete(session=session, app=app, body=body)


@router.post(
    "/google/finish",
    response_model=SessionLoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Finish Google sign-in for an app",
    description="Exchange the challenge (plus an authenticator code if enabled) for an app-scoped session.",
    responses=_SIGN_IN,
)
@limiter.limit("5/minute")
async def app_google_finish(
    *, request: Request, session: SessionDep, app: AppDep, body: GoogleFinish
) -> SessionLoginResponse:
    return await app_service.google_finish(
        request=request, session=session, app=app, body=body
    )


@router.post(
    "/phone-code/start",
    response_model=Message,
    status_code=status.HTTP_200_OK,
    summary="Send a phone or WhatsApp sign-in code",
    description="Send a code to a phone number already linked to an account. Disabled until a provider is configured.",
    responses=_SIGN_IN,
)
@limiter.limit("3/minute")
async def app_phone_code_start(
    *, request: Request, session: SessionDep, app: AppDep, body: AppPhoneCodeStart
) -> Message:
    _ = request
    return await app_service.phone_code_start(session=session, app=app, body=body)


@router.post(
    "/phone-code/verify",
    response_model=SessionLoginResponse,
    status_code=status.HTTP_200_OK,
    summary="Sign in with a phone or WhatsApp code",
    description="Verify a phone code and create an app-scoped session.",
    responses=_SIGN_IN,
)
@limiter.limit("10/minute")
async def app_phone_code_verify(
    *, request: Request, session: SessionDep, app: AppDep, body: AppPhoneCodeVerify
) -> SessionLoginResponse:
    return await app_service.phone_code_verify(
        request=request, session=session, app=app, body=body
    )


@router.post(
    "/phone/link/start",
    response_model=Message,
    status_code=status.HTTP_200_OK,
    summary="Send a code to link a phone number",
    description="Signed-in members link a phone number for code sign-in.",
    responses={**_SIGN_IN, 401: {"description": "Not signed in to this app"}},
)
@limiter.limit("3/minute")
async def app_phone_link_start(
    *,
    request: Request,
    session: SessionDep,
    app: AppDep,
    user: AppMember,
    body: AppPhoneCodeStart,
) -> Message:
    _ = request
    return await app_service.phone_link_start(
        session=session, app=app, user=user, body=body
    )


@router.post(
    "/phone/link/verify",
    response_model=Message,
    status_code=status.HTTP_200_OK,
    summary="Confirm a phone number link",
    description="Verify the code and attach the phone number to the signed-in account.",
    responses={
        **_SIGN_IN,
        401: {"description": "Not signed in to this app"},
        409: {"description": "Number linked elsewhere"},
    },
)
@limiter.limit("10/minute")
async def app_phone_link_verify(
    *,
    request: Request,
    session: SessionDep,
    app: AppDep,
    user: AppMember,
    body: AppPhoneCodeVerify,
) -> Message:
    _ = request
    return await app_service.phone_link_verify(
        session=session, app=app, user=user, body=body
    )
