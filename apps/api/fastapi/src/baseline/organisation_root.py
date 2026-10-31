"""Explicit installation seed; application models have no default organisation."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from src.hr.models import Organisation
from src.organisations import service as organisations_service
from src.organisations import sites as organisations_sites

GAA_ORGANISATION_ID = "gaa"
GAA_ORGANISATION_NAME = "Grenada Airports Authority"


def seed_organisation(session: Session) -> None:
    if session.get(Organisation, GAA_ORGANISATION_ID) is None:
        session.add(
            Organisation(id=GAA_ORGANISATION_ID, code="GAA", name=GAA_ORGANISATION_NAME)
        )
        session.flush()
    # Bridge A (ADR-0022): repairs a missing platform row on re-runs too.
    organisations_service.ensure_for_hr_organisation_sync(
        session, organisation_id=GAA_ORGANISATION_ID, name=GAA_ORGANISATION_NAME
    )
    organisations_sites.ensure_default_public_sites_sync(session)
    from src.hr.payroll.catalogue import seed_gaa_pay_items

    seed_gaa_pay_items(session)


async def seed_organisation_async(session: AsyncSession) -> None:
    if await session.get(Organisation, GAA_ORGANISATION_ID) is None:
        session.add(
            Organisation(id=GAA_ORGANISATION_ID, code="GAA", name=GAA_ORGANISATION_NAME)
        )
        await session.flush()
    await organisations_service.ensure_for_hr_organisation(
        session,
        organisation_id=GAA_ORGANISATION_ID,
        name=GAA_ORGANISATION_NAME,
        code="GAA",
    )
    await organisations_sites.ensure_default_public_sites(session)
    from src.hr.payroll.catalogue import seed_gaa_pay_items_async

    await seed_gaa_pay_items_async(session)
