"""The first-superuser script finds the account whatever the case of the address."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from scripts import grant_superuser
from tests.factories import make_user


@pytest.fixture
def empty_system(monkeypatch):
    async def none_active(_session: AsyncSession) -> int:
        return 0

    monkeypatch.setattr(grant_superuser, "active_superuser_count", none_active)


@pytest.mark.usefixtures("empty_system")
async def test_mixed_case_account_is_found_by_a_lowercase_address(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, email="First.Admin@Example.org")
    plan = await grant_superuser.grant_first_superuser(
        db_async, email="first.admin@example.org", apply=True
    )
    assert plan.ready is True
    assert plan.user_id == user.id
