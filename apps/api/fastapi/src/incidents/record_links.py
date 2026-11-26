"""The ``incidents.incident`` record kind for other domains' links (src/record_links.py).

A viewer sees an incident's reference and title only when they hold
``incidents.incidents.read`` in the same organisation (which also needs the
organisation's ``incidents`` entitlement); otherwise the link is "not available".
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import record_links
from src.organisations import grants
from src.organisations.models import Membership

from .models import Incident

KIND = "incidents.incident"
READ_KEY = "incidents.incidents.read"


async def _resolve(
    session: AsyncSession,
    organisation_id: str,
    membership: Membership,
    ids: list[str],
) -> dict[str, record_links.RecordLink]:
    if membership.organisation_id != organisation_id:
        return {}
    # Effective keys already drop products the organisation is not entitled to.
    if not await grants.has_org_permission(
        session, membership=membership, permission_key=READ_KEY
    ):
        return {}
    rows = await session.execute(
        select(Incident.id, Incident.reference, Incident.title).where(
            Incident.organisation_id == organisation_id, Incident.id.in_(ids)
        )
    )
    return {
        row.id: record_links.RecordLink(title=f"{row.reference} {row.title}")
        for row in rows
    }


def register() -> None:
    record_links.register(KIND, _resolve)
