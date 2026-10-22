"""Guards for the permission registry (src/auth/permissions.py).

These tests are the governance mechanism: they fail if a permission string used
anywhere in the code is missing from the registry, if a default-role bundle
references an unknown key, or if seeding is not idempotent.
"""

import re
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import Permission, Role
from src.auth.permissions import (
    ALL_PERMISSION_KEYS,
    DEFAULT_ROLES,
    ORGANISATION_BOUND_KEYS,
    PERMISSIONS,
    seed_permissions_and_roles_async,
)

SRC_DIR = Path(__file__).resolve().parents[2] / "src"
_PERMISSION_KEY_RE = re.compile(r'permission_key="([^"]+)"')


def _permission_keys_used_in_code() -> set[str]:
    keys: set[str] = set()
    for path in SRC_DIR.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        keys.update(_PERMISSION_KEY_RE.findall(path.read_text(encoding="utf-8")))
    return keys


def test_every_used_permission_key_is_registered() -> None:
    used = _permission_keys_used_in_code()
    missing = used - ALL_PERMISSION_KEYS
    assert not missing, (
        f"Permission keys used in code but absent from the registry: {sorted(missing)}. "
        "Add them to src/auth/permissions.py:PERMISSIONS."
    )


def test_at_least_the_known_keys_are_used() -> None:
    # Sanity: the scan actually finds keys (guards against a broken regex/path).
    assert _permission_keys_used_in_code(), (
        "No permission_key= usages found — scan broken?"
    )


def test_default_role_bundles_reference_known_keys() -> None:
    for role_name, (_description, keys) in DEFAULT_ROLES.items():
        unknown = set(keys) - ALL_PERMISSION_KEYS
        assert not unknown, (
            f"Role '{role_name}' references unknown keys: {sorted(unknown)}"
        )


async def test_catalog_is_seeded(db_async: AsyncSession) -> None:
    await seed_permissions_and_roles_async(db_async)
    result = await db_async.execute(select(Permission.key))
    seeded = set(result.scalars().all())
    assert ALL_PERMISSION_KEYS <= seeded


async def test_default_roles_are_seeded(db_async: AsyncSession) -> None:
    await seed_permissions_and_roles_async(db_async)
    result = await db_async.execute(select(Role.name))
    role_names = set(result.scalars().all())
    assert set(DEFAULT_ROLES) <= role_names


async def test_seeding_is_idempotent(db_async: AsyncSession) -> None:
    await seed_permissions_and_roles_async(db_async)
    first = len((await db_async.execute(select(Permission))).scalars().all())
    await seed_permissions_and_roles_async(db_async)
    second = len((await db_async.execute(select(Permission))).scalars().all())
    assert first == second == len(ALL_PERMISSION_KEYS)


# --- Binding (ADR-0044) ---------------------------------------------------------

NEW_ORGANISATION_KEYS = {
    "events.listings.manage",
    "events.door.scan",
    "events.tickets.sell",
    "events.refunds.issue",
    "events.settlement.view",
    "events.team.manage",
    "bookings.agenda.read",
    "bookings.bookings.manage",
    "bookings.settings.manage",
    "bookings.team.manage",
}


def test_every_key_has_description_and_valid_binding() -> None:
    assert len({p.key for p in PERMISSIONS}) == len(PERMISSIONS)
    for pdef in PERMISSIONS:
        assert pdef.description.strip(), pdef.key
        assert pdef.binding in ("global", "organisation"), pdef.key


def test_organisation_binding_of_known_keys() -> None:
    from src.organisations.api_key_scopes import all_scopes

    assert NEW_ORGANISATION_KEYS <= ORGANISATION_BOUND_KEYS
    assert set(all_scopes()) <= ORGANISATION_BOUND_KEYS
    by_key = {p.key: p for p in PERMISSIONS}
    for key in ("events.moderate", "events.organiser.manage", "app.events.access"):
        assert by_key[key].binding == "global"


def test_default_roles_never_carry_organisation_keys() -> None:
    # New organisation keys are granted to no staff role by default.
    for role_name, (_description, keys) in DEFAULT_ROLES.items():
        assert not set(keys) & ORGANISATION_BOUND_KEYS, role_name


async def test_staff_role_editor_hides_organisation_keys(
    db_async: AsyncSession,
) -> None:
    from src.auth.roles import get_permissions_with_count

    await seed_permissions_and_roles_async(db_async)
    listed, count = await get_permissions_with_count(
        session=db_async, skip=0, limit=10_000
    )
    keys = {p.key for p in listed}
    assert not keys & ORGANISATION_BOUND_KEYS
    assert keys == ALL_PERMISSION_KEYS - ORGANISATION_BOUND_KEYS
    assert count == len(keys)


def organisation_role_bundles() -> dict[str, tuple[str, ...]]:
    """Product role bundles (ADR-0044). Empty until S1 introduces them."""
    return {}


def test_product_role_bundle_keys_are_organisation_bound() -> None:
    # Rule for S1: every product role bundle key must exist in PERMISSIONS with
    # binding=organisation. No bundles exist in S0, so this passes vacuously.
    for role_key, keys in organisation_role_bundles().items():
        unknown = set(keys) - ALL_PERMISSION_KEYS
        assert not unknown, f"{role_key}: unknown keys {sorted(unknown)}"
        not_bound = set(keys) - ORGANISATION_BOUND_KEYS
        assert not not_bound, f"{role_key}: not organisation-bound {sorted(not_bound)}"


async def test_staff_role_cannot_be_given_organisation_keys(
    db_async: AsyncSession,
) -> None:
    import uuid

    import pytest

    from src.auth.models import User
    from src.baseline.schemas import RolePermissionsInput
    from src.baseline.service import update_role_configuration
    from src.exceptions import AppException

    await seed_permissions_and_roles_async(db_async)
    role = (
        (await db_async.execute(select(Role).where(Role.name == "events-member")))
        .scalars()
        .one()
    )
    with pytest.raises(AppException) as raised:
        await update_role_configuration(
            session=db_async,
            current_user=User(id=uuid.uuid4(), is_superuser=True),
            role_id=role.id,
            body=RolePermissionsInput(permission_keys=["events.door.scan"]),
        )
    assert raised.value.status_code == 400


def test_superuser_is_not_granted_organisation_key_through_has_permission() -> None:
    import uuid

    from src.auth.models import User
    from src.auth.policy import has_permission

    superuser = User(id=uuid.uuid4(), is_superuser=True, roles=[])
    assert (
        has_permission(current_user=superuser, permission_key="events.door.scan")
        is False
    )
    assert (
        has_permission(current_user=superuser, permission_key="bookings.read") is False
    )
    assert has_permission(current_user=superuser, permission_key="user.manage") is True


async def test_role_with_scope_key_can_be_saved_and_cleaned(
    db_async: AsyncSession,
) -> None:
    from sqlalchemy.orm import selectinload

    from src.auth.models import User
    from src.baseline.schemas import RolePermissionsInput
    from src.baseline.service import update_role_configuration

    await seed_permissions_and_roles_async(db_async)
    role = (
        (
            await db_async.execute(
                select(Role)
                .where(Role.name == "events-member")
                .options(selectinload(Role.permissions))
            )
        )
        .scalars()
        .one()
    )
    scope = (
        (
            await db_async.execute(
                select(Permission).where(Permission.key == "bookings.read")
            )
        )
        .scalars()
        .one()
    )
    role.permissions = [*role.permissions, scope]
    await db_async.commit()
    keys = ["app.events.access", "bookings.read"]
    actor = User(
        username="roleadmin",
        first_name="Role",
        last_name="Admin",
        email="roleadmin@example.com",
        hashed_password="unused",
        is_superuser=True,
    )
    db_async.add(actor)
    await db_async.flush()
    kept = await update_role_configuration(
        session=db_async,
        current_user=actor,
        role_id=role.id,
        body=RolePermissionsInput(permission_keys=keys),
    )
    assert "bookings.read" in kept.permission_keys
    removed = await update_role_configuration(
        session=db_async,
        current_user=actor,
        role_id=role.id,
        body=RolePermissionsInput(permission_keys=["app.events.access"]),
    )
    assert removed.permission_keys == ["app.events.access"]
