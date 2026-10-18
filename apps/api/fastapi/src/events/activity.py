"""Events activity log (F7): who changed what, kept append-only.

``record`` adds a row to the caller's Events session, so history commits with
the change. Summaries hold field names and short public values only (titles,
statuses, times); never names, emails or free-text bodies. Actors are auth user
ids; ``entries`` joins the actor's current profile name at read time.
"""

import uuid
from collections.abc import Mapping
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from . import schemas
from .models import Activity, MemberProfile

#: Short public values worth keeping as before/after; other fields list the name.
SHORT_FIELDS = (
    "title",
    "category",
    "parish",
    "venue",
    "admission",
    "capacity",
    "visibility",
    "status",
    "starts_at",
    "ends_at",
)


def diff(before: Mapping[str, Any], after: Mapping[str, Any]) -> dict[str, object]:
    """A compact summary of what changed between two listing snapshots."""
    changed = [key for key in after if before.get(key) != after[key]]
    short = [key for key in changed if key in SHORT_FIELDS]
    return {
        "changed": changed,
        "from": {key: before.get(key) for key in short},
        "to": {key: after[key] for key in short},
    }


def record(
    db: AsyncSession,
    *,
    actor_id: uuid.UUID,
    action: str,
    entity_type: str,
    entity_id: str,
    organiser_id: uuid.UUID | None = None,
    summary: Mapping[str, object] | None = None,
) -> None:
    """Add a history row to the caller's transaction (no commit)."""
    db.add(
        Activity(
            id=uuid.uuid4(),
            organiser_id=organiser_id,
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor_id=actor_id,
            summary=dict(summary or {}),
        )
    )


async def entries(
    db: AsyncSession, *, entity_type: str, entity_id: str, limit: int = 50
) -> list[schemas.ActivityEntry]:
    rows = (
        await db.scalars(
            select(Activity)
            .where(Activity.entity_type == entity_type, Activity.entity_id == entity_id)
            .order_by(Activity.created_at.desc(), Activity.id)
            .limit(limit)
        )
    ).all()
    names = dict(
        (
            await db.execute(
                select(MemberProfile.user_id, MemberProfile.display_name).where(
                    MemberProfile.user_id.in_({row.actor_id for row in rows})
                )
            )
        )
        .tuples()
        .all()
    )
    return [
        schemas.ActivityEntry(
            id=row.id,
            action=row.action,
            entity_type=row.entity_type,
            entity_id=row.entity_id,
            actor_id=row.actor_id,
            actor_name=names.get(row.actor_id),
            summary=row.summary,
            created_at=row.created_at,
        )
        for row in rows
    ]
