"""Preview GAA structure by default; --apply adds missing records only."""

import argparse
import asyncio
import json

from sqlalchemy import select

from src.auth.models import User
from src.baseline import organisation
from src.config import settings
from src.database import async_session_factory


async def run(environment: str, username: str, apply: bool) -> None:
    if environment != settings.ENVIRONMENT:
        raise SystemExit("Requested environment does not match configured environment")
    async with async_session_factory() as session:
        actor = (
            (await session.execute(select(User).where(User.username == username)))
            .scalars()
            .first()
        )
        if actor is None or not actor.is_active or not actor.is_superuser:
            raise SystemExit("Choose an existing active administrator as --actor")
        result = await (
            organisation.apply(session, actor)
            if apply
            else organisation.preview(session, actor)
        )
        print(
            json.dumps(
                {
                    "environment": environment,
                    "database": settings.POSTGRES_DB,
                    "applied": apply,
                    **result.model_dump(mode="json"),
                },
                indent=2,
            )
        )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--environment", required=True, choices=["local", "staging", "production"]
    )
    parser.add_argument(
        "--actor", required=True, help="Existing administrator username"
    )
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    asyncio.run(run(args.environment, args.actor, args.apply))
