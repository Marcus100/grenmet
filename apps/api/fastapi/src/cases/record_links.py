"""The ``cases.case`` record kind for other domains' links (src/record_links.py).

A viewer sees a case's reference and title only when they hold the read key of
that case's own programme in the same organisation.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import record_links
from src.organisations import grants
from src.organisations.models import Membership

from .models import Case

KIND = "cases.case"


async def _resolve(
    session: AsyncSession,
    organisation_id: str,
    membership: Membership,
    ids: list[str],
) -> dict[str, record_links.RecordLink]:
    if membership.organisation_id != organisation_id:
        return {}
    held = await grants.effective_keys(session, membership=membership)
    rows = await session.execute(
        select(Case.id, Case.reference, Case.title, Case.programme).where(
            Case.organisation_id == organisation_id, Case.id.in_(ids)
        )
    )
    return {
        row.id: record_links.RecordLink(title=f"{row.reference} {row.title}")
        for row in rows
        if f"{row.programme}.cases.read" in held
    }


def register() -> None:
    record_links.register(KIND, _resolve)
