"""Grant superuser to the first administrator of an empty system (ADR-0059 rule 1).

This is the only way to make a superuser without an invitation, and it works only
while no active superuser exists. Every later superuser comes from an invitation
(``POST /api/v1/auth/superuser-invitations``), which needs a superuser's two-step
sign-in. Preview by default; ``--apply`` makes the change.

    uv run --frozen --package fast-back python scripts/grant_superuser.py EMAIL
    uv run --frozen --package fast-back python scripts/grant_superuser.py EMAIL --apply

Refused while ANY active superuser exists. On a system that was seeded with the
placeholder FIRST_SUPERUSER account, that placeholder must be deactivated first
(docs/operations/privileged-mfa.md); otherwise this script stays refused by design.

The account must exist, be active and have a verified email address (sign in with
an emailed code first). The grant also clears staff approval. It writes one audit row
with no actor, because it is an operator action taken outside any session. No token,
code or password is printed.
"""

import argparse
import asyncio
import uuid
from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit
from src.auth import service
from src.auth.models import User
from src.database import async_session_factory
from src.utils.datetime import utc_now

GRANT_ACTION = "superuser_granted"
SOURCE_NOTE = "first superuser, scripts/grant_superuser.py"


@dataclass(frozen=True)
class GrantPlan:
    email: str
    user_id: uuid.UUID | None
    ready: bool
    note: str


async def active_superuser_count(session: AsyncSession) -> int:
    count = await session.scalar(
        select(func.count(User.id)).where(
            User.is_superuser.is_(True), User.is_active.is_(True)
        )
    )
    return int(count or 0)


async def grant_first_superuser(
    session: AsyncSession, *, email: str, apply: bool
) -> GrantPlan:
    """Describe the grant, and with ``apply`` make it and commit. Idempotent: a second
    run finds an active superuser and changes nothing."""
    clean = email.strip().lower()
    if await active_superuser_count(session) > 0:
        return GrantPlan(
            clean,
            None,
            False,
            "an active superuser already exists; invite further superusers from the "
            "admin app instead",
        )
    user = (
        await session.execute(
            select(User).where(func.lower(User.email) == clean).with_for_update()
        )
    ).scalar_one_or_none()
    if user is None:
        return GrantPlan(clean, None, False, "no account has this address")
    if not user.is_active or service.is_anonymised(user):
        return GrantPlan(clean, user.id, False, "the account is inactive")
    if user.email_verified_at is None:
        return GrantPlan(
            clean,
            user.id,
            False,
            "the email address is not verified: sign in with an emailed code first",
        )
    plan = GrantPlan(clean, user.id, True, "ready to grant superuser")
    if not apply:
        return plan
    user.is_superuser = True
    user.registration_pending = False
    session.add(user)
    audit.set_actor(session, None)
    await audit.record_change(
        session,
        entity_type="account",
        entity_id=str(user.id),
        record_type="account",
        record_id=str(user.id),
        action=GRANT_ACTION,
        changes={
            "invitee_user_id": (None, str(user.id)),
            "source": (None, SOURCE_NOTE),
            "granted_at": (None, utc_now().isoformat()),
        },
    )
    await session.commit()
    return GrantPlan(clean, user.id, True, "granted superuser")


async def _main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("email", help="the account's email address")
    parser.add_argument(
        "--apply", action="store_true", help="make the change (default: preview)"
    )
    args = parser.parse_args(argv)
    async with async_session_factory() as session:
        plan = await grant_first_superuser(session, email=args.email, apply=args.apply)
    state = "applied" if args.apply and plan.ready else "preview"
    print(f"{state}: {plan.note}")
    return 0 if plan.ready else 1


def main() -> None:
    raise SystemExit(asyncio.run(_main()))


if __name__ == "__main__":
    main()
