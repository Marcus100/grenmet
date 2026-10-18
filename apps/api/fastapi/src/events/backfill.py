"""Back every Events organiser with a platform organisation (F5, ADR-0022).

Events and the platform live in different databases, so there is no shared
transaction. The platform organisation id is derived from the organiser id
(``org_<first 16 hex of the organiser UUID>``), so a run interrupted between the
two commits is repaired by simply running again: the platform row is found,
missing memberships are added, and the Events column is set.

The legacy ``organiser_members`` table has no roles or timestamps, so the member
with the lowest user id becomes the owner and the rest become admins. Owners can
change roles afterwards through organisation membership management.

    python -m src.events.backfill [--dry-run]
"""

import argparse
import asyncio
import json
import sys
import uuid
from dataclasses import asdict, dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.organisations import service as organisations
from src.organisations.models import (
    Membership,
    MembershipRole,
    OrganisationKind,
    PlatformOrganisation,
)

from .models import Organiser, OrganiserMember


@dataclass
class BackfillResult:
    linked: int = 0
    memberships_created: int = 0
    skipped_members: int = 0


def platform_id_for(organiser_id: uuid.UUID) -> str:
    return f"org_{organiser_id.hex[:16]}"


async def backfill(
    events: AsyncSession, platform: AsyncSession, *, dry_run: bool = False
) -> BackfillResult:
    """Create/link platform organisations for organisers without one. Re-runnable."""
    result = BackfillResult()
    pending = (
        await events.scalars(
            select(Organiser)
            .where(Organiser.organisation_id.is_(None))
            .order_by(Organiser.created_at, Organiser.id)
        )
    ).all()
    for organiser in pending:
        organisation_id = platform_id_for(organiser.id)
        result.linked += 1
        if dry_run:
            continue
        member_ids = sorted(
            (
                await events.scalars(
                    select(OrganiserMember.user_id).where(
                        OrganiserMember.organiser_id == organiser.id
                    )
                )
            ).all()
        )
        if await platform.get(PlatformOrganisation, organisation_id) is None:
            await organisations.create_organisation(
                platform,
                name=organiser.name.strip() or organiser.slug,
                kind=OrganisationKind.BUSINESS,
                slug=organiser.slug,
                organisation_id=organisation_id,
            )
        known_users = (
            set(await platform.scalars(select(User.id).where(User.id.in_(member_ids))))
            if member_ids
            else set()
        )
        existing = set(
            await platform.scalars(
                select(Membership.user_id).where(
                    Membership.organisation_id == organisation_id
                )
            )
        )
        has_owner = bool(
            await platform.scalar(
                select(Membership.id).where(
                    Membership.organisation_id == organisation_id,
                    Membership.role == MembershipRole.OWNER.value,
                )
            )
        )
        for user_id in member_ids:
            if user_id not in known_users:
                result.skipped_members += 1
                continue
            if user_id in existing:
                continue
            await organisations.add_member(
                platform,
                organisation_id=organisation_id,
                user_id=user_id,
                role=MembershipRole.ADMIN if has_owner else MembershipRole.OWNER,
            )
            has_owner = True
            result.memberships_created += 1
        await platform.commit()
        organiser.organisation_id = organisation_id
        await events.commit()
    return result


async def run(*, dry_run: bool) -> int:
    from src.database import async_session_factory

    from . import database

    events = database.create_session()
    if events is None:
        sys.stderr.write("EVENTS_DATABASE_URL is not set\n")
        return 1
    async with events, async_session_factory() as platform:
        result = await backfill(events, platform, dry_run=dry_run)
    await database.close_engine()
    sys.stdout.write(json.dumps({"dry_run": dry_run, **asdict(result)}) + "\n")
    return 0


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true")
    raise SystemExit(asyncio.run(run(dry_run=parser.parse_args().dry_run)))
