"""
User management endpoints for CRUD operations on users.

This router handles:
- User listing (superuser only)
- User creation (superuser only)
- User registration (public)
- User profile updates
- User deletion
- Password changes
"""

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Request, status
from fastapi.concurrency import run_in_threadpool

from src.auth import app_service, email_change, service
from src.auth import superuser_invitation as invitations
from src.auth.app_schemas import AppEmailCodeStart
from src.auth.constants import (
    ERROR_INSUFFICIENT_PRIVILEGES,
    ERROR_SUPERUSER_DELETE_SELF,
    ERROR_USER_EXISTS,
    ERROR_USER_NOT_FOUND,
    SUCCESS_PASSWORD_UPDATED,
    SUCCESS_USER_DELETED,
)
from src.auth.exceptions import SuperuserByInvitationError
from src.auth.models import User
from src.auth.schemas import (
    AccountProfilePublic,
    AccountProfileUpdate,
    UpdatePassword,
    UserCreate,
    UserPublic,
    UserRegister,
    UserUpdate,
    UserUpdateMe,
)
from src.dependencies import (
    AccountUser,
    CurrentUser,
    OwnAccountUser,
    RateLimitedAccountUser,
    RateLimitedOwnAccountUser,
    SessionDep,
    TokenDep,
    get_current_user_manager,
    is_user_manager,
)
from src.email import generate_new_account_email, send_email
from src.email_config import email_settings
from src.exceptions import AppException, AuthorizationError, NotFoundError
from src.models import ApiError, Message
from src.openapi_responses import AUTHENTICATED, RateLimitedBody
from src.pagination import PaginatedResponse, PaginationParams, get_pagination_params
from src.rate_limit import account_address, limiter, mail_limit_address
from src.turnstile import auth_turnstile_policy, require_turnstile

router = APIRouter(prefix="/auth/users", tags=["users"])


@router.get(
    "",
    dependencies=[Depends(get_current_user_manager)],
    response_model=PaginatedResponse[UserPublic],
    summary="List users",
    description="Return users and counts within active employer/department user.manage scope. Superusers see all accounts. Uses standard pagination.",
    responses={**AUTHENTICATED, status.HTTP_200_OK: {"description": "Users returned"}},
)
async def read_users(
    session: SessionDep,
    current_user: CurrentUser,
    pagination: Annotated[PaginationParams, Depends(get_pagination_params)],
) -> Any:
    """
    Retrieve users.
    """
    users, count = await service.get_users(
        session=session,
        skip=pagination.skip,
        limit=pagination.limit,
        current_user=current_user,
    )
    return PaginatedResponse(
        data=[UserPublic.model_validate(user, from_attributes=True) for user in users],
        count=count,
        page=pagination.page,
        size=pagination.size,
    )


@router.post(
    "",
    response_model=UserPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create user",
    description="Create a global account (superuser only). HR placement and app admission are separate explicit actions. Superuser status is never granted here (403): send a superuser invitation instead (POST /api/v1/auth/superuser-invitations).",
    responses={
        status.HTTP_201_CREATED: {"description": "User created"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "User with this email already exists",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient privileges, or is_superuser true (invitation only)",
        },
    },
)
async def create_user(
    *,
    session: SessionDep,
    user_in: UserCreate,
    current_user: Annotated[User, Depends(get_current_user_manager)],
) -> Any:
    """
    Create new user.
    """
    if not current_user.is_superuser:
        raise AuthorizationError(ERROR_INSUFFICIENT_PRIVILEGES)
    if user_in.is_superuser:
        raise SuperuserByInvitationError()
    user = await service.get_user_by_email(session=session, email=user_in.email)
    if user:
        raise AppException(ERROR_USER_EXISTS, 400)
    user = await service.create_user(session=session, user_create=user_in)
    if email_settings.EMAILS_ENABLED and user_in.email:
        email_data = await generate_new_account_email(
            email_to=user_in.email,
            username=user_in.email,
        )
        await run_in_threadpool(
            send_email,
            email_to=user_in.email,
            subject=email_data.subject,
            html_content=email_data.html_content,
        )
    return user


@router.get(
    "/me",
    response_model=UserPublic,
    summary="Get current user",
    description="Return the currently authenticated user.",
    responses={
        **AUTHENTICATED,
        status.HTTP_200_OK: {"description": "Current user returned"},
    },
)
async def read_user_me(current_user: AccountUser) -> Any:
    """
    Get current user.
    """
    return current_user


@router.patch(
    "/me",
    response_model=UserPublic,
    summary="Update current user",
    description="Update profile fields for the currently authenticated user.",
    responses={
        status.HTTP_200_OK: {"description": "User updated"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Changing the email needs the current password or emailed "
            "code (detail starts email_change_proof_required), or the proof is wrong",
        },
        status.HTTP_409_CONFLICT: {
            "model": ApiError,
            "description": "Email already exists",
        },
        status.HTTP_429_TOO_MANY_REQUESTS: {
            "model": ApiError,
            "description": "Too many email change attempts for this account",
        },
    },
)
async def update_user_me(
    *, session: SessionDep, user_in: UserUpdateMe, current_user: CurrentUser
) -> Any:
    return await service.update_user_me(
        session=session, current_user=current_user, user_in=user_in
    )


def _account_profile(user: User) -> AccountProfilePublic:
    return AccountProfilePublic(
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        name_is_placeholder=service.name_is_placeholder(user),
        phone=user.contact_phone,
    )


@router.get(
    "/me/profile",
    response_model=AccountProfilePublic,
    summary="Get my profile",
    description=(
        "The signed-in person's own name, email and phone number, for the account "
        "app's profile checklist. Accepts an account token or the account app's "
        "session; other apps' tokens are refused."
    ),
    responses={
        **AUTHENTICATED,
        status.HTTP_200_OK: {"description": "Profile returned"},
    },
)
async def read_my_profile(*, current_user: OwnAccountUser) -> Any:
    return _account_profile(current_user)


@router.patch(
    "/me/profile",
    response_model=AccountProfilePublic,
    summary="Update my profile",
    description=(
        "Save the signed-in person's own first name, last name and phone number. A "
        "field left out is not changed. The phone number is a contact detail: it is "
        "normalised to E.164, nothing is sent, and it is not a sign-in factor; a "
        "blank or null phone removes it. "
        "Accepts an account token or the account app's session."
    ),
    responses={
        **AUTHENTICATED,
        status.HTTP_200_OK: {"description": "Profile saved"},
        status.HTTP_429_TOO_MANY_REQUESTS: {
            "model": RateLimitedBody,
            "description": "Too many changes; try again later",
        },
    },
)
@limiter.limit("10/minute", key_func=account_address)
async def update_my_profile(
    *,
    request: Request,
    session: SessionDep,
    profile_in: AccountProfileUpdate,
    current_user: RateLimitedOwnAccountUser,
) -> Any:
    _ = request  # the rate limiter reads it
    user = await service.update_account_profile(
        session=session, user=current_user, profile_in=profile_in
    )
    return _account_profile(user)


@router.post(
    "/me/email-change/code",
    response_model=Message,
    summary="Send a code to change the email address",
    description=(
        "For an account with no password: email a six-digit code to the current "
        "address. Send it back as email_code with PATCH /auth/users/me."
    ),
    responses={
        status.HTTP_200_OK: {"description": "Code sent to the current address"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "The account signs in with a password",
        },
        status.HTTP_429_TOO_MANY_REQUESTS: {
            "model": ApiError,
            "description": "A code was sent recently or too many were requested",
        },
    },
)
async def send_email_change_code(
    *, session: SessionDep, current_user: CurrentUser
) -> Any:
    await email_change.start_code(session=session, user=current_user)
    return Message(message=email_change.CODE_SENT_MESSAGE)


@router.patch(
    "/me/password",
    response_model=Message,
    summary="Change current user password",
    description="Change password for the currently authenticated user.",
    responses={
        status.HTTP_200_OK: {"description": "Password updated"},
        status.HTTP_400_BAD_REQUEST: {
            "model": ApiError,
            "description": "Current password incorrect or new password unchanged",
        },
        status.HTTP_429_TOO_MANY_REQUESTS: {
            "model": RateLimitedBody,
            "description": "Too many attempts; try again later",
        },
    },
)
# Checks the current password: 5 a minute per account, like recover and reset password.
@limiter.limit("5/minute", key_func=account_address)
async def update_password_me(
    *,
    request: Request,
    session: SessionDep,
    body: UpdatePassword,
    current_user: RateLimitedAccountUser,
) -> Any:
    _ = request  # the rate limiter reads it
    await service.update_password(
        session=session,
        user=current_user,
        current_password=body.current_password,
        new_password=body.new_password,
    )
    return Message(message=SUCCESS_PASSWORD_UPDATED)


@router.post(
    "/me/staff-access-request",
    response_model=UserPublic,
    status_code=status.HTTP_200_OK,
    summary="Request staff access",
    description=(
        "Ask administrators for GAA/GMS staff access. Adds the account to staff "
        "setup and the approval queue; repeating the request keeps the first date."
    ),
    responses={
        status.HTTP_401_UNAUTHORIZED: {
            "model": ApiError,
            "description": "Not signed in",
        },
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Verify your email first",
        },
    },
)
async def request_staff_access(
    *, session: SessionDep, current_user: AccountUser
) -> Any:
    return await service.request_staff_access(session=session, user=current_user)


@router.delete(
    "/me",
    response_model=Message,
    summary="Delete current user",
    description=(
        "Delete currently authenticated user account. The account is anonymised, not "
        "removed. Refused with 403 while the person is still employed: contact HR first."
    ),
    responses={
        status.HTTP_200_OK: {"description": "User deleted"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": (
                "Superuser cannot delete own account, or the person is still employed "
                "(contact HR first)"
            ),
        },
    },
)
async def delete_user_me(session: SessionDep, current_user: CurrentUser) -> Any:
    if current_user.is_superuser:
        raise AuthorizationError(ERROR_SUPERUSER_DELETE_SELF)
    await service.require_no_live_employment(session, current_user)
    await service.delete_user(session=session, user=current_user)
    return Message(message=SUCCESS_USER_DELETED)


@router.post(
    "/signup",
    response_model=Message,
    status_code=status.HTTP_200_OK,
    summary="Password sign-up (retired)",
    description=(
        "Retired (#958). This never creates a password account. It answers as the "
        "emailed-code start does (the same reply for every address) and sends a "
        "sign-in code, which creates the account on first use. Use "
        "/auth/email-code/start and /auth/email-code/verify. It cannot carry a "
        "Turnstile token, so while AUTH_TURNSTILE_SECRET_KEY is set it answers "
        '400 "Verification failed" and sends nothing.'
    ),
    responses={
        400: {"model": ApiError, "description": "Turnstile verification failed"},
        429: {"model": RateLimitedBody, "description": "Rate limit exceeded"},
    },
)
@limiter.limit("5/minute")
async def register_user(
    request: Request, session: SessionDep, user_in: UserRegister
) -> Any:
    # No token field: otherwise this would bypass the code start's bot check.
    await require_turnstile(request, None, auth_turnstile_policy())
    # The submitted password, names and username are discarded on purpose.
    return await app_service.account_email_code_start(
        session=session,
        body=AppEmailCodeStart(email=user_in.email),
        client_ip=mail_limit_address(request),
    )


@router.get(
    "/{user_id}",
    response_model=UserPublic,
    summary="Get user by ID",
    description="Return yourself or a user within active management scope. Scoped managers cannot read platform administrator accounts.",
    responses={
        status.HTTP_200_OK: {"description": "User returned"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient privileges",
        },
    },
)
async def read_user_by_id(
    user_id: uuid.UUID, session: SessionDep, current_user: CurrentUser
) -> Any:
    """
    Get a specific user by id.
    """
    user = await session.get(User, user_id)
    if not user:
        raise NotFoundError(ERROR_USER_NOT_FOUND)
    if user.id == current_user.id:
        return user
    if not is_user_manager(current_user):
        raise AuthorizationError(ERROR_INSUFFICIENT_PRIVILEGES)
    await service.require_user_management(session, current_user, user)
    return user


@router.patch(
    "/{user_id}",
    response_model=UserPublic,
    summary="Update user by ID",
    description="Update a user within active management scope. Scoped managers may correct names and titles; global account security, activation and platform/app privileges are superuser-only. Setting is_superuser to true is refused (403): use a superuser invitation. Setting it to false needs a superuser with an authenticator and a two-step sign-in; it is audited, the other superusers are emailed, and the last active superuser cannot be removed (409). Deactivating the last active superuser is refused (409) too.",
    responses={
        status.HTTP_200_OK: {"description": "User updated"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient privileges, is_superuser true (invitation only), or removing superuser status without a superuser authenticator and two-step sign-in",
        },
        status.HTTP_404_NOT_FOUND: {"model": ApiError, "description": "User not found"},
        status.HTTP_409_CONFLICT: {
            "model": ApiError,
            "description": "Email already exists, or removing superuser status or deactivating the account would leave no active superuser",
        },
    },
)
async def update_user(
    *,
    session: SessionDep,
    user_id: uuid.UUID,
    user_in: UserUpdate,
    current_user: Annotated[User, Depends(get_current_user_manager)],
    token: TokenDep,
) -> Any:
    """
    Update a user.
    """

    db_user = await session.get(User, user_id)
    if not db_user:
        raise NotFoundError(ERROR_USER_NOT_FOUND)
    await service.require_user_management(session, current_user, db_user)
    if not current_user.is_superuser and (
        db_user.is_superuser
        or current_user.id == db_user.id
        or bool(
            user_in.model_fields_set
            - {"title", "first_name", "middle_name", "last_name"}
        )
        or "is_superuser" in user_in.model_fields_set
        or "cms_access" in user_in.model_fields_set
    ):
        raise AuthorizationError(ERROR_INSUFFICIENT_PRIVILEGES)
    if user_in.email:
        existing_user = await service.get_user_by_email(
            session=session, email=user_in.email
        )
        if existing_user and existing_user.id != user_id:
            raise AppException(ERROR_USER_EXISTS, 409)
    if "is_superuser" in user_in.model_fields_set:
        if user_in.is_superuser is None:
            raise AppException("is_superuser must be true or false", 422)
        if user_in.is_superuser:
            raise SuperuserByInvitationError()
        # Removing superuser status: a two-step sign-in, an audit row and notices.
        await invitations.require_superuser_session(session, current_user, token=token)
        await invitations.demote_superuser(session, actor=current_user, target=db_user)
    # Commits the demotion together with the other fields, so it is one transaction.
    return await service.update_user(session=session, db_user=db_user, user_in=user_in)


@router.delete(
    "/{user_id}",
    summary="Delete user by ID",
    description="Delete a global account by ID (superuser only). The account is anonymised, not removed. The last active superuser cannot be deleted (409).",
    responses={
        status.HTTP_200_OK: {"description": "User deleted"},
        status.HTTP_403_FORBIDDEN: {
            "model": ApiError,
            "description": "Insufficient privileges or self-deletion",
        },
        status.HTTP_404_NOT_FOUND: {"model": ApiError, "description": "User not found"},
        status.HTTP_409_CONFLICT: {
            "model": ApiError,
            "description": "Would leave no active superuser",
        },
    },
)
async def delete_user(
    session: SessionDep,
    current_user: Annotated[User, Depends(get_current_user_manager)],
    user_id: uuid.UUID,
) -> Message:
    user = await session.get(User, user_id)
    if not user:
        raise NotFoundError(ERROR_USER_NOT_FOUND)
    await service.require_user_management(session, current_user, user)
    if not current_user.is_superuser:
        raise AuthorizationError("Global account deletion requires a superuser")
    if user.id == current_user.id:
        raise AuthorizationError(ERROR_SUPERUSER_DELETE_SELF)
    if user.is_superuser and not current_user.is_superuser:
        raise AuthorizationError(ERROR_INSUFFICIENT_PRIVILEGES)
    await service.delete_user(session=session, user=user, actor=current_user)
    return Message(message=SUCCESS_USER_DELETED)
