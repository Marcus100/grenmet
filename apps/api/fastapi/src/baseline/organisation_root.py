"""Explicit installation seed; application models have no default organisation."""

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import Session

from src.hr.models import Organisation

GAA_ORGANISATION_ID = "gaa"


def seed_organisation(session: Session) -> None:
    if session.get(Organisation, GAA_ORGANISATION_ID) is None:
        session.add(
            Organisation(
                id=GAA_ORGANISATION_ID, code="GAA", name="Grenada Airports Authority"
            )
        )
        session.flush()


async def seed_organisation_async(session: AsyncSession) -> None:
    if await session.get(Organisation, GAA_ORGANISATION_ID) is None:
        session.add(
            Organisation(
                id=GAA_ORGANISATION_ID, code="GAA", name="Grenada Airports Authority"
            )
        )
        await session.flush()
