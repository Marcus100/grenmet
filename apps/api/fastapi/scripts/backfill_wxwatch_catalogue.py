"""Preview or apply one bounded catalogue batch; no file moves or gallery cutover."""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from src.wxwatch import catalogue
from src.wxwatch.config import wxwatch_settings


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write catalogue records (default is a read-only preview)",
    )
    parser.add_argument(
        "--images-root", type=Path, default=wxwatch_settings.LOCAL_IMAGES_DIR
    )
    parser.add_argument("--backend-key", default="local-primary")
    parser.add_argument("--limit", type=int, default=100)
    parser.add_argument("--after-id", type=int, default=0)
    args = parser.parse_args()
    if not 1 <= args.limit <= 1000 or args.after_id < 0:
        parser.error("limit must be 1..1000 and after-id nonnegative")
    if not args.backend_key or len(args.backend_key) > 100:
        parser.error("backend-key must be a stable name of at most 100 characters")
    if args.images_root is not None and not args.images_root.is_dir():
        parser.error("images-root must be an existing directory")
    if not wxwatch_settings.DATABASE_URL:
        parser.error("WXWATCH_DATABASE_URL is required")
    url = make_url(wxwatch_settings.DATABASE_URL)
    expected = os.environ.get(
        "WXWATCH_DB_NAME",
        "wxwatch_staging" if os.environ.get("ENVIRONMENT") == "staging" else "wxwatch",
    )
    if (
        url.get_backend_name() != "postgresql"
        or url.database != expected
        or expected
        in {
            "app",
            "app_prod",
            "app_staging",
            "app_test",
            "postgres",
            "template0",
            "template1",
        }
    ):
        parser.error("Refusing operation outside the configured WxWatch database")
    engine = create_engine(
        url.set(drivername="postgresql+psycopg"),
        poolclass=NullPool,
        connect_args={"connect_timeout": 5},
    )
    try:
        with engine.connect() as connection:
            if connection.scalar(text("SELECT current_database()")) != expected:
                parser.error(
                    "Connected database does not match the configured WxWatch database"
                )
        if args.apply:
            result = catalogue.backfill_batch(
                engine,
                root=args.images_root,
                backend=args.backend_key,
                limit=args.limit,
                after_id=args.after_id,
            )
        else:
            with engine.connect() as connection:
                rows = (
                    connection.execute(
                        text(
                            "SELECT id FROM weather_images WHERE id>:after ORDER BY id LIMIT :limit"
                        ),
                        {"after": args.after_id, "limit": args.limit},
                    )
                    .scalars()
                    .all()
                )
                result = {
                    "preview": True,
                    "records": len(rows),
                    "last_id": rows[-1] if rows else args.after_id,
                    "file_verification": args.images_root is not None,
                }
        print(json.dumps(result, sort_keys=True))
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
