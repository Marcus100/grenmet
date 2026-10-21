"""The local demo seed creates organisers through the service, not raw SQL."""

import importlib.util

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.events.models import Listing, Organiser
from src.organisations.models import Membership
from tests.events.support import ROOT, SessionFactory


@pytest.mark.asyncio
async def test_seed_links_organisers_to_platform_organisations(
    events_db: SessionFactory,
    db_async: AsyncSession,
):
    spec = importlib.util.spec_from_file_location(
        "seed_events_demo", ROOT / "scripts/seed_events_demo.py"
    )
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)

    await module.seed(str(settings.FIRST_SUPERUSER))
    await module.seed(str(settings.FIRST_SUPERUSER))  # create-once

    async with events_db() as db:
        organisers = (await db.scalars(select(Organiser))).all()
        assert len(organisers) == len(module.ORGANISERS)
        assert all(row.organisation_id for row in organisers)
        assert await db.scalar(select(func.count()).select_from(Listing)) == len(
            module.LISTINGS
        )
    owners = await db_async.scalar(
        select(func.count())
        .select_from(Membership)
        .where(
            Membership.organisation_id.in_([row.organisation_id for row in organisers]),
            Membership.role == "owner",
        )
    )
    assert owners == len(module.ORGANISERS)
