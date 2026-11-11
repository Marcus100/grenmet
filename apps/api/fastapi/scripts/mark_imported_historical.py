"""Mark the hourly importer's own unreviewed drafts of a month as historical.

One-off, for months the importer saved as drafts before ``--historical`` existed.
Only drafts whose ``notes`` start with ``cl1_import.IMPORT_NOTE_PREFIX``, that nobody
reviewed and that were never sent, for station 78958, inside the Grenada local month
(UTC-4) are changed. Observer-typed, reviewed, accepted and sent records are left
alone. Dry run by default; each change is audited.

    uv run --frozen --package fast-back python scripts/mark_imported_historical.py --month 2026-10
    uv run --frozen --package fast-back python scripts/mark_imported_historical.py --month 2026-10 --apply --actor admin

Same protected-database guard as ``import_cl1_synop.py``: refuses unless
``ENVIRONMENT=local`` and the register host is this machine, or ``--allow-non-local``
(owner's go only, for staging and production).
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from import_cl1_synop import refuse_unless_local_register
from sqlalchemy import select, text

from src.auth.models import User
from src.database import async_session_factory
from src.eregister import database, historical


async def run(args: argparse.Namespace) -> None:
    try:
        start, end = historical.month_range(args.month)
    except historical.MonthError as exc:
        raise SystemExit(str(exc)) from exc
    refuse_unless_local_register(args.allow_non_local)
    register = database.create_session()
    if register is None:
        raise SystemExit("EREGISTER_DATABASE_URL is not set.")
    async with async_session_factory() as app_session, register:
        connected = await register.scalar(text("SELECT current_database()"))
        expected = os.environ.get("EREGISTER_DB_NAME", "eregister")
        if connected != expected and not args.allow_non_local:
            raise SystemExit(f"Connected to {connected!r}, expected {expected!r}.")
        actor = (
            (await app_session.execute(select(User).where(User.username == args.actor)))
            .scalars()
            .first()
        )
        if actor is None:
            raise SystemExit(f"User {args.actor!r} not found.")
        result = await historical.convert_month(
            register=register,
            app_session=app_session,
            actor=actor,
            month=args.month,
            apply=args.apply,
        )
    print(f"Month {args.month} (UTC {start:%Y-%m-%d %H:%M} to {end:%Y-%m-%d %H:%M})")
    print(f"  {result.candidates:>5} drafts made by the hourly importer")
    print(f"  {result.reviewed:>5} left alone: already reviewed")
    print(f"  {result.sent:>5} left alone: sent or queued")
    print(f"  {result.other_live:>5} other live records in the month, not touched")
    verb = "converted to historical" if args.apply else "would be converted"
    print(f"  {result.converted:>5} {verb}")
    if not args.apply:
        print("\nDry run: nothing was changed. Add --apply to convert them.")
    await database.close_engine()


def main() -> None:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("--month", required=True, help="Local month, YYYY-MM")
    parser.add_argument("--apply", action="store_true", help="Make the change")
    parser.add_argument("--actor", default="admin", help="Username audited as actor")
    parser.add_argument(
        "--allow-non-local",
        action="store_true",
        help="Needed outside ENVIRONMENT=local (owner go only)",
    )
    asyncio.run(run(parser.parse_args()))


if __name__ == "__main__":
    main()
