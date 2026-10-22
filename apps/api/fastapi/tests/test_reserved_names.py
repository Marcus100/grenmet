"""Platform reserved names (ADR-0043): one list, kept in step with its sources."""

import re
from pathlib import Path

import httpx
import pytest
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import seed as bookings_seed
from src.bookings.models import BookingProfile
from src.bookings.schemas import BookingProfileUpdate
from src.organisations import service as organisation_service
from src.organisations import sites
from src.organisations.models import OrganisationKind, PlatformOrganisation
from src.organisations.schemas import (
    PlatformOrganisationCreate,
    PlatformOrganisationUpdate,
)
from src.utils.reserved_names import RESERVED_NAMES, is_reserved
from tests.factories import make_user
from tests.organisations.support import headers_for

REPO = Path(__file__).resolve().parents[4]
PORTS_MD = REPO / "docs" / "ports.md"
#: Platform-owned organisations that legitimately hold a reserved name. Their
#: slugs are written by seeds (``reserved_ok=True`` or the installation seed),
#: never by a user. ``gaa`` comes from ``scripts/seed_gaa_organisation.py``.
PLATFORM_OWNED = {"barrels", "babydoll", "gaa"}


def _ports_md_names() -> set[str]:
    section = PORTS_MD.read_text().split("## Reserved names", 1)[1].split("\n## ", 1)[0]
    names: set[str] = set()
    for line in section.splitlines():
        match = re.match(r"- \*\*[^*]+:\*\* (.+)\.$", line)
        if match:
            names.update(part.strip() for part in match.group(1).split(","))
    return names


def _top_level_route_folders(app_dir: Path) -> set[str]:
    """Static URL segments directly under the app root (route groups are looked through)."""
    found: set[str] = set()
    for entry in app_dir.iterdir():
        if not entry.is_dir() or entry.name.startswith(("_", "@", "[")):
            continue
        if entry.name.startswith("("):
            found |= _top_level_route_folders(entry)
        else:
            found.add(entry.name)
    return found


# --- the list --------------------------------------------------------------------


def test_is_reserved_ignores_case_and_space() -> None:
    assert is_reserved("studio")
    assert is_reserved(" Studio ")
    assert not is_reserved("harbour-salon")


def test_reserved_set_matches_ports_md() -> None:
    assert _ports_md_names() == set(RESERVED_NAMES), (
        "docs/ports.md 'Reserved names' and src/utils/reserved_names.py differ; "
        "edit both together"
    )


def test_every_reserved_name_is_a_valid_lowercase_label() -> None:
    for name in RESERVED_NAMES:
        assert re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name), name


@pytest.mark.parametrize("app", ["bookings", "hr"])
def test_tenant_path_apps_route_folders_are_reserved(app: str) -> None:
    """A tenant slug is a path under these hosts; it must not shadow a route."""
    app_dir = REPO / "apps" / "web" / app / "src" / "app"
    if not app_dir.is_dir():
        pytest.skip(f"apps/web/{app} does not exist yet")
    folders = _top_level_route_folders(app_dir)
    assert folders, "route folder scan found nothing; the scan is broken"
    missing = sorted(name for name in folders if not is_reserved(name))
    assert not missing, (
        f"apps/web/{app} has top-level routes that a tenant slug could shadow; "
        f"add them to reserved_names.py and docs/ports.md: {missing}"
    )


def test_bookings_known_routes_are_reserved() -> None:
    for name in ("studio", "signin", "auth", "api", "bookings"):
        assert is_reserved(name)


# --- seeded data -----------------------------------------------------------------


async def test_seeds_only_hold_reserved_names_that_the_platform_owns(
    db_async: AsyncSession,
) -> None:
    """Existing data must not collide silently: list every seeded slug."""
    await sites.ensure_default_public_sites(db_async)
    await bookings_seed.seed_babydoll(db_async)
    await db_async.commit()
    org_slugs = set((await db_async.scalars(select(PlatformOrganisation.slug))).all())
    booking_slugs = set(
        (await db_async.scalars(select(BookingProfile.public_slug))).all()
    )
    colliding = {slug for slug in org_slugs | booking_slugs if is_reserved(slug)}
    assert colliding <= PLATFORM_OWNED, colliding - PLATFORM_OWNED


# --- validation ------------------------------------------------------------------


def test_booking_public_slug_refuses_reserved_names() -> None:
    BookingProfileUpdate(public_slug="harbour-salon", display_name="Harbour Salon")
    for slug in ("studio", "signin", "auth", "api", "bookings", "admin"):
        with pytest.raises(ValidationError):
            BookingProfileUpdate(public_slug=slug, display_name="X")


def test_organisation_create_slug_refuses_reserved_names() -> None:
    PlatformOrganisationCreate(name="A", kind=OrganisationKind.BUSINESS, slug="acme")
    with pytest.raises(ValidationError):
        PlatformOrganisationCreate(
            name="A", kind=OrganisationKind.BUSINESS, slug="studio"
        )


def test_organisation_update_schema_leaves_the_check_to_the_service() -> None:
    """An unchanged slug that predates the list must stay editable."""
    assert PlatformOrganisationUpdate(slug="studio").slug == "studio"


async def test_admin_create_and_rename_refuse_reserved_slugs(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin = await make_user(db_async, superuser=True)
    headers = headers_for(admin)
    refused = await async_client.post(
        "/api/v1/organisations",
        json={"name": "A", "kind": "business", "slug": "signin"},
        headers=headers,
    )
    assert refused.status_code == 422
    created = await async_client.post(
        "/api/v1/organisations",
        json={"name": "A", "kind": "business", "slug": "acme-co"},
        headers=headers,
    )
    assert created.status_code == 201
    renamed = await async_client.patch(
        f"/api/v1/organisations/{created.json()['id']}",
        json={"slug": "studio"},
        headers=headers,
    )
    assert renamed.status_code == 422


async def test_existing_colliding_slug_stays_readable_and_editable(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """Only new or changed slugs are validated; old data keeps working."""
    admin = await make_user(db_async, superuser=True)
    legacy = PlatformOrganisation(
        id="org_legacy_reserved",
        slug="support",
        name="Legacy Support Co",
        kind=OrganisationKind.BUSINESS.value,
        status="active",
    )
    db_async.add(legacy)
    await db_async.commit()
    headers = headers_for(admin)
    read = await async_client.get(f"/api/v1/organisations/{legacy.id}", headers=headers)
    assert read.status_code == 200
    assert read.json()["slug"] == "support"
    same = await async_client.patch(
        f"/api/v1/organisations/{legacy.id}",
        json={"name": "Legacy Support Ltd", "slug": "support"},
        headers=headers,
    )
    assert same.status_code == 200


async def test_derived_slugs_skip_reserved_names(db_async: AsyncSession) -> None:
    org = await organisation_service.create_organisation(db_async, name="Admin")
    assert org.slug == "admin-2"
    assert not is_reserved(org.slug)


async def test_platform_seeds_may_claim_their_own_reserved_name(
    db_async: AsyncSession,
) -> None:
    org = await organisation_service.create_organisation(
        db_async, name="Studio Seed", slug="studio", reserved_ok=True
    )
    assert org.slug == "studio"
