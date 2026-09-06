"""Preview by default; --apply --environment <exact environment> initialises once."""

import argparse
import json
from pathlib import Path

from sqlmodel import Session

from src.baseline.seed import seed_baseline
from src.config import settings
from src.database import engine


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--profile", type=Path, required=True)
    parser.add_argument(
        "--environment", choices=("local", "staging", "production"), required=True
    )
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.environment != settings.ENVIRONMENT:
        parser.error("Requested environment does not match configured environment")
    if settings.FIRST_SUPERUSER != "admin@weather.gd":
        parser.error(
            "Configure FIRST_SUPERUSER=admin@weather.gd before baseline initialization"
        )
    profile = json.loads(args.profile.read_text())
    with Session(engine) as session:
        result = seed_baseline(session, profile, apply=args.apply)
        if args.apply:
            session.commit()
        else:
            session.rollback()
    print(
        json.dumps(
            {
                "environment": settings.ENVIRONMENT,
                "host": settings.POSTGRES_SERVER,
                "database": settings.POSTGRES_DB,
                **result,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
