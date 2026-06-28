"""Guards for the permission registry (src/auth/permissions.py).

These tests are the governance mechanism: they fail if a permission string used
anywhere in the code is missing from the registry, if a default-role bundle
references an unknown key, or if seeding is not idempotent.
"""

import re
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.auth.models import Permission, Role
from src.auth.permissions import (
    ALL_PERMISSION_KEYS,
    DEFAULT_ROLES,
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
