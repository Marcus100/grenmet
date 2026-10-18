"""Bridge A (ADR-0022): HR employers are mirrored into the platform, never drifting."""

import pytest
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from src.baseline.organisation_root import seed_organisation_async
from src.exceptions import AppException
from src.hr import organisations as hr_organisations
from src.hr.models import Organisation
from src.organisations import service
from src.organisations.models import PlatformOrganisation
from tests.factories import make_user


async def test_baseline_gaa_row_is_mirrored_as_client(db_async: AsyncSession):
    gaa = await db_async.get(PlatformOrganisation, "gaa")
    assert gaa is not None
    assert (gaa.slug, gaa.kind, gaa.name, gaa.status) == (
        "gaa",
        "client",
        "Grenada Airports Authority",
        "active",
    )


async def test_baseline_seed_repairs_a_missing_platform_row(db_async: AsyncSession):
    await db_async.execute(
        delete(PlatformOrganisation).where(PlatformOrganisation.id == "gaa")
    )
    await db_async.commit()
    assert await service.missing_platform_organisations(db_async) == ["gaa"]
    await seed_organisation_async(db_async)
    await db_async.commit()
    assert await service.missing_platform_organisations(db_async) == []


async def test_hr_create_writes_the_platform_row_in_the_same_transaction(
    db_async: AsyncSession,
):
    admin = await make_user(db_async, superuser=True)
    created = await hr_organisations.create_organisation(
        db_async,
        admin,
        organisation_id="grenada-power",
        code="GP",
        name=" Grenada Power ",
    )
    platform = await db_async.get(PlatformOrganisation, "grenada-power")
    assert created.id == "grenada-power"
    assert platform is not None
    assert (platform.slug, platform.name, platform.kind) == (
        "grenada-power",
        "Grenada Power",
        "client",
    )


async def test_hr_create_that_conflicts_leaves_no_platform_row(db_async: AsyncSession):
    admin = await make_user(db_async, superuser=True)
    with pytest.raises(AppException) as error:
        await hr_organisations.create_organisation(
            db_async, admin, organisation_id="gaa", code="OTHER", name="Duplicate"
        )
    assert error.value.status_code == 409
    gaa = await db_async.get(PlatformOrganisation, "gaa")
    assert gaa is not None
    assert gaa.name == "Grenada Airports Authority"


async def test_hr_rename_keeps_the_platform_name_in_step(db_async: AsyncSession):
    admin = await make_user(db_async, superuser=True)
    await hr_organisations.rename_organisation(
        db_async, admin, "gaa", "Grenada Airports Authority (GAA)"
    )
    platform = await db_async.get(PlatformOrganisation, "gaa")
    assert platform is not None
    assert platform.name == "Grenada Airports Authority (GAA)"
    assert platform.slug == "gaa"


async def test_reconciliation_every_hr_organisation_has_a_platform_row(
    db_async: AsyncSession,
):
    admin = await make_user(db_async, superuser=True)
    await hr_organisations.create_organisation(
        db_async, admin, organisation_id="acme", code="ACME", name="Acme"
    )
    # Drift: an HR row written around the bridge (legacy code path or manual SQL).
    db_async.add(Organisation(id="legacy", code="LEG", name="Legacy Org"))
    db_async.add(Organisation(id="barrels", code="BRL", name="Barrels Grenada"))
    await db_async.commit()

    assert await service.missing_platform_organisations(db_async) == [
        "barrels",
        "legacy",
    ]
    assert await service.reconcile_hr_organisations(db_async) == ["barrels", "legacy"]
    await db_async.commit()

    assert await service.missing_platform_organisations(db_async) == []
    assert await service.reconcile_hr_organisations(db_async) == []
    barrels = await db_async.get(PlatformOrganisation, "barrels")
    legacy = await db_async.get(PlatformOrganisation, "legacy")
    assert barrels is not None and barrels.kind == "barrels"
    assert legacy is not None and legacy.kind == "client"
