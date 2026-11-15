"""A superuser is not held by staff approval on a superuser-only app (ADR-0059 rule 5).

GAA and GMS staff apps keep the approval gate for everyone, superusers included."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src import dependencies
from src.auth import eligibility
from src.exceptions import AuthorizationError
from tests.factories import make_user


async def pending_user(db: AsyncSession, *, superuser: bool):
    user = await make_user(db, superuser=superuser)
    user.registration_pending = True
    db.add(user)
    await db.commit()
    return user


async def test_pending_superuser_passes_the_barrels_admin_gate(
    db_async: AsyncSession,
) -> None:
    user = await pending_user(db_async, superuser=True)
    allowed = await dependencies.get_authenticated_user(
        db_async, user.id, session_app="barrels-admin"
    )
    assert allowed.id == user.id


@pytest.mark.parametrize("session_app", ["gaa-admin", None])
async def test_pending_superuser_keeps_the_gate_on_other_staff_apps(
    db_async: AsyncSession, session_app: str | None
) -> None:
    user = await pending_user(db_async, superuser=True)
    with pytest.raises(AuthorizationError):
        await dependencies.get_authenticated_user(
            db_async, user.id, session_app=session_app
        )


async def test_pending_non_superuser_is_refused_on_barrels_admin(
    db_async: AsyncSession,
) -> None:
    user = await pending_user(db_async, superuser=False)
    with pytest.raises(AuthorizationError):
        await dependencies.get_authenticated_user(
            db_async, user.id, session_app="barrels-admin"
        )


async def test_pending_superuser_is_not_held_on_a_superuser_only_app_only() -> None:
    from src.auth.models import User

    pending_superuser = User(
        is_active=True,
        is_superuser=True,
        registration_pending=True,
        password_setup_pending=False,
    )
    pending_staff = User(
        is_active=True,
        is_superuser=False,
        registration_pending=True,
        password_setup_pending=False,
    )
    assert eligibility.is_staff_eligible(pending_superuser, superuser_only=True)
    assert not eligibility.is_staff_eligible(pending_superuser)
    assert not eligibility.is_staff_eligible(pending_staff, superuser_only=True)
    assert not eligibility.is_staff_eligible(pending_staff)


async def test_inactive_superuser_is_refused_even_on_barrels_admin() -> None:
    from src.auth.models import User

    inactive = User(
        is_active=False,
        is_superuser=True,
        registration_pending=True,
        password_setup_pending=False,
    )
    assert not eligibility.is_staff_eligible(inactive, superuser_only=True)
