"""How the actor signed in is stamped once per request, from the token (ADR-0016).

The stamp comes from the token the request presented, not from whichever dependency
ran first, and a later dependency in the same request cannot change it."""

from datetime import timedelta

from sqlalchemy.ext.asyncio import AsyncSession
from starlette.requests import Request

from src.audit.listener import ACTOR_SESSION_KEY
from src.auth.config import auth_settings
from src.auth.utils import create_access_token
from src.dependencies import get_authenticated_user, optional_account
from tests.events.roles import user_with_role
from tests.factories import make_user


def _request(token: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "query_string": b"",
            "headers": [(b"authorization", f"Bearer {token}".encode())],
        }
    )


def _token(user, app: str | None = None) -> str:
    return create_access_token(
        user.id,
        timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app=app,
    )


async def test_app_token_stamps_its_app_and_a_later_account_dependency_cannot_overwrite(
    db_async: AsyncSession,
):
    user = await user_with_role(db_async, "events-member")

    signed_in = await optional_account(
        _request(_token(user, "events")), db_async, app="events"
    )
    assert signed_in is not None
    assert db_async.info[ACTOR_SESSION_KEY] == ("app", "events")

    # The same request then runs an account dependency: the first stamp stays.
    await get_authenticated_user(db_async, user.id)
    assert db_async.info[ACTOR_SESSION_KEY] == ("app", "events")


async def test_account_token_stamps_account(db_async: AsyncSession):
    user = await make_user(db_async)

    await optional_account(_request(_token(user)), db_async)

    assert db_async.info[ACTOR_SESSION_KEY] == ("account", None)


async def test_guest_app_session_leaves_no_stamp(db_async: AsyncSession):
    # Eligible for nothing: the app token makes the request a guest, not a signed-in
    # actor, so no sign-in kind is recorded.
    user = await user_with_role(db_async, None)

    signed_in = await optional_account(
        _request(_token(user, "events")), db_async, app="events"
    )

    assert signed_in is None
    assert ACTOR_SESSION_KEY not in db_async.info
