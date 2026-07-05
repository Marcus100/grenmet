"""Extended auth service tests covering new service functions."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.auth.utils import verify_password
from src.exceptions import AppException
from tests.utils.utils import random_email, random_lower_string


async def _make_user(
    session: AsyncSession, password: str = "initialPass1"
) -> service.User:
    return await create_user(
        session=session,
        user_create=UserCreate(
            email=random_email(),
            username=f"t_{random_lower_string()}",
            password=password,
            first_name="Test",
            last_name="User",
        ),
    )


async def test_set_password_changes_hash(db_async: AsyncSession) -> None:
    """set_password stores a new bcrypt hash."""
    user = await _make_user(db_async, "oldpassword1")
    old_hash = user.hashed_password

    await service.set_password(session=db_async, user=user, new_password="newpassword1")

    await db_async.refresh(user)
    assert user.hashed_password != old_hash
    assert verify_password("newpassword1", user.hashed_password)


async def test_update_password_correct_old_password(db_async: AsyncSession) -> None:
    """update_password succeeds when current_password is correct."""
    user = await _make_user(db_async, "currentPass1")

    await service.update_password(
        session=db_async,
        user=user,
        current_password="currentPass1",
        new_password="newPass1",
    )

    await db_async.refresh(user)
    assert verify_password("newPass1", user.hashed_password)


async def test_update_password_wrong_current_raises(db_async: AsyncSession) -> None:
    """update_password raises AppException(400) when current password is wrong."""
    user = await _make_user(db_async, "correctPass1")

    with pytest.raises(AppException) as exc_info:
        await service.update_password(
            session=db_async,
            user=user,
            current_password="wrongpassword",
            new_password="newPass1",
        )
    assert exc_info.value.status_code == 400


async def test_update_password_same_as_current_raises(db_async: AsyncSession) -> None:
    """update_password raises AppException(400) when new password equals current."""
    user = await _make_user(db_async, "samePass1234")

    with pytest.raises(AppException) as exc_info:
        await service.update_password(
            session=db_async,
            user=user,
            current_password="samePass1234",
            new_password="samePass1234",
        )
    assert exc_info.value.status_code == 400


async def test_delete_user_removes_record(db_async: AsyncSession) -> None:
    """delete_user removes the user from the database."""
    user = await _make_user(db_async)
    user_id = user.id

    await service.delete_user(session=db_async, user=user)

    deleted = await db_async.get(service.User, user_id)
    assert deleted is None


async def test_update_user_me_email_conflict_raises(db_async: AsyncSession) -> None:
    """update_user_me raises AppException(409) when email is taken by another user."""
    from src.auth.schemas import UserUpdateMe

    existing = await _make_user(db_async)
    user = await _make_user(db_async)

    with pytest.raises(AppException) as exc_info:
        await service.update_user_me(
            session=db_async,
            current_user=user,
            user_in=UserUpdateMe(email=existing.email),
        )
    assert exc_info.value.status_code == 409


async def test_update_user_me_own_email_succeeds(db_async: AsyncSession) -> None:
    """update_user_me does not raise when user submits their own email."""
    from src.auth.schemas import UserUpdateMe

    user = await _make_user(db_async)

    result = await service.update_user_me(
        session=db_async,
        current_user=user,
        user_in=UserUpdateMe(email=user.email, first_name="Updated"),
    )
    assert result.first_name == "Updated"


async def test_authenticate_correct_password(db_async: AsyncSession) -> None:
    """authenticate returns the user for valid credentials."""
    user = await _make_user(db_async, "validPass123")

    result = await service.authenticate(
        session=db_async, email=user.email, password="validPass123"
    )
    assert result is not None
    assert result.id == user.id


async def test_authenticate_wrong_password_returns_none(db_async: AsyncSession) -> None:
    """authenticate returns None when the password is wrong."""
    user = await _make_user(db_async, "validPass123")

    result = await service.authenticate(
        session=db_async, email=user.email, password="wrongPass123"
    )
    assert result is None


async def test_authenticate_unknown_email_returns_none(db_async: AsyncSession) -> None:
    """authenticate returns None for an email that does not exist."""
    result = await service.authenticate(
        session=db_async, email=random_email(), password="anything123"
    )
    assert result is None


async def test_authenticate_unknown_email_equalizes_timing(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The unknown-email path still runs a bcrypt verify (against the dummy hash)
    so it is not distinguishable from a wrong-password by timing."""
    from src.auth.utils import DUMMY_PASSWORD_HASH

    calls: list[tuple[str, str]] = []

    async def _spy(plain: str, hashed: str) -> bool:
        calls.append((plain, hashed))
        return False

    monkeypatch.setattr(service, "verify_password_async", _spy)

    result = await service.authenticate(
        session=db_async, email=random_email(), password="anything123"
    )
    assert result is None
    assert calls == [("anything123", DUMMY_PASSWORD_HASH)]
