"""Who may see and change which janitorial records.

Role permissions say *what* a user may do; building grants say *where*.
Superusers and holders of ``janitorial.scope.manage`` administer grants and act
on every building. Everyone else acts only on buildings they hold an active
grant for — a permission without a grant gives no management access.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import has_permission, require_permission
from src.exceptions import AuthorizationError

from .models import Area, BuildingGrant, ZoneArea
from .schemas import JanitorialAccess

OUT_OF_SCOPE = "You do not have access to this building"


def all_buildings(user: User) -> bool:
    return user.is_superuser or has_permission(
        current_user=user, permission_key="janitorial.scope.manage"
    )


async def building_scope(session: AsyncSession, user: User) -> set[int] | None:
    """Building ids the user may act on; ``None`` means every building."""
    if all_buildings(user):
        return None
    rows = await session.scalars(
        select(BuildingGrant.building_id).where(
            BuildingGrant.user_id == user.id, BuildingGrant.revoked_at.is_(None)
        )
    )
    return set(rows)


async def access(session: AsyncSession, user: User) -> JanitorialAccess:
    scope = await building_scope(session, user)

    def can(key: str) -> bool:
        return has_permission(current_user=user, permission_key=key)

    return JanitorialAccess(
        canView=can("janitorial.view"),
        canManageCatalogue=can("janitorial.catalogue.manage"),
        canManageStaff=can("janitorial.staff.manage"),
        canManageShifts=can("janitorial.shifts.manage"),
        canManageScope=can("janitorial.scope.manage"),
        buildingIds=None if scope is None else sorted(scope),
    )


def require_view(user: User) -> None:
    require_permission(current_user=user, permission_key="janitorial.view")


def require_catalogue(user: User) -> None:
    require_permission(current_user=user, permission_key="janitorial.catalogue.manage")


def require_staff(user: User) -> None:
    require_permission(current_user=user, permission_key="janitorial.staff.manage")


def require_shifts(user: User) -> None:
    require_permission(current_user=user, permission_key="janitorial.shifts.manage")


def require_scope_admin(user: User) -> None:
    require_permission(current_user=user, permission_key="janitorial.scope.manage")


async def require_building(session: AsyncSession, user: User, building_id: int) -> None:
    scope = await building_scope(session, user)
    if scope is not None and building_id not in scope:
        raise AuthorizationError(OUT_OF_SCOPE)


async def require_areas(session: AsyncSession, user: User, area_ids: set[int]) -> None:
    """Every area must sit in a building the user may act on."""
    scope = await building_scope(session, user)
    if scope is None or not area_ids:
        return
    buildings = set(
        await session.scalars(
            select(Area.building_id).where(Area.id.in_(area_ids)).distinct()
        )
    )
    if not buildings <= scope:
        raise AuthorizationError(OUT_OF_SCOPE)


async def require_zone(session: AsyncSession, user: User, zone_id: int) -> None:
    area_ids = set(
        await session.scalars(
            select(ZoneArea.area_id).where(ZoneArea.zone_id == zone_id)
        )
    )
    await require_areas(session, user, area_ids)
