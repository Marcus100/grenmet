"""Sample gamification content, seeded on demand (never at app startup or in a migration).

``seed_parish_explorer`` gives an organisation a "Parish Explorer" trail with one
venue per parish and a completion achievement. Call it from a one-off script or
an admin task; it is idempotent.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import gamification
from .models_gamification import AchievementRule, Trail, TrailKind
from .schemas_gamification import (
    RewardsAchievementCreate,
    RewardsTrailCreate,
    RewardsTrailStopCreate,
)

PARISH_EXPLORER = "Parish Explorer"
PARISHES = (
    "St George",
    "St John",
    "St Mark",
    "St Patrick",
    "St Andrew",
    "St David",
)


async def seed_parish_explorer(session: AsyncSession, *, organisation_id: str) -> Trail:
    """Create (once) the Parish Explorer trail for an organisation and return it.

    Needs ``ORG_SECRET_ENCRYPTION_KEYS`` (503 otherwise) because each stop gets
    a venue with its own signing secret. The caller commits.
    """
    existing = await session.scalar(
        select(Trail).where(
            Trail.organisation_id == organisation_id, Trail.name == PARISH_EXPLORER
        )
    )
    if existing is not None:
        return existing
    stops = []
    for parish in PARISHES:
        venue = await gamification.create_venue(
            session, organisation_id=organisation_id, name=f"{parish} check-in point"
        )
        stops.append(RewardsTrailStopCreate(label=parish, venue_id=venue.id))
    trail = await gamification.create_trail(
        session,
        organisation_id=organisation_id,
        payload=RewardsTrailCreate(
            name=PARISH_EXPLORER,
            description="Visit a check-in point in every parish.",
            kind=TrailKind.PARISH,
            stops=stops,
        ),
    )
    await gamification.create_definition(
        session,
        organisation_id=organisation_id,
        payload=RewardsAchievementCreate(
            key=f"parish-explorer-{trail.id.hex[:8]}",
            name="Parish Explorer",
            description="Checked in in every parish.",
            rule_type=AchievementRule.VISITED_ALL_STOPS_OF_TRAIL,
            parameters={"trail_id": str(trail.id)},
        ),
    )
    return trail
