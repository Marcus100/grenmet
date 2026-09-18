"""Verify and preview one existing NHC run manifest; --apply writes the catalogue."""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.pool import NullPool

from src.wxwatch.config import wxwatch_settings
from src.wxwatch.nhc_import import import_manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument(
        "--manifest", required=True, help="Relative runs/.../manifest.json path"
    )
    parser.add_argument("--backend-key", default="nhc-local")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument(
        "--db-host",
        help="Explicit host override, e.g. 127.0.0.1 when running outside Docker",
    )
    args = parser.parse_args()
    engine = None
    try:
        if args.apply:
            if not wxwatch_settings.DATABASE_URL:
                parser.error("WXWATCH_DATABASE_URL is required for --apply")
            url = make_url(wxwatch_settings.DATABASE_URL)
            expected = os.environ.get(
                "WXWATCH_DB_NAME",
                "wxwatch_staging"
                if os.environ.get("ENVIRONMENT") == "staging"
                else "wxwatch",
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
                parser.error("Refusing operation outside configured WxWatch database")
            url = url.set(drivername="postgresql+psycopg")
            if args.db_host:
                url = url.set(host=args.db_host)
            engine = create_engine(
                url, poolclass=NullPool, connect_args={"connect_timeout": 5}
            )
            with engine.connect() as c:
                if c.scalar(text("SELECT current_database()")) != expected:
                    parser.error(
                        "Connected database does not match configured WxWatch database"
                    )
        print(
            json.dumps(
                import_manifest(
                    args.root, args.manifest, engine=engine, backend=args.backend_key
                ),
                sort_keys=True,
            )
        )
    finally:
        if engine is not None:
            engine.dispose()


if __name__ == "__main__":
    main()
