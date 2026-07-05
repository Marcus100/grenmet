#!/usr/bin/env python3
"""
Backend pre-start script.

This script runs before the API starts to ensure the database is ready.
It's called by the prestart.sh script during container startup.
"""

import logging
import sys
import time

from sqlmodel import Session, create_engine, text

from src.config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Wait up to MAX_TRIES * WAIT_SECONDS for the database to accept connections.
# The DB and API start together in compose with no ordering guarantee, so the
# first few probes routinely fail while Postgres finishes booting.
MAX_TRIES = 60
WAIT_SECONDS = 1.0


def _check_connection() -> None:
    engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))
    with Session(engine) as session:
        result = session.exec(text("SELECT 1")).first()
    if not result:
        raise RuntimeError("SELECT 1 returned no rows")


def init() -> None:
    """Block until the database is reachable, retrying with a fixed backoff."""
    logger.info("Initializing service")

    for attempt in range(1, MAX_TRIES + 1):
        try:
            _check_connection()
            logger.info("Service finished initializing")
            return
        except Exception as exc:  # noqa: BLE001 - retry on any connection failure
            if attempt >= MAX_TRIES:
                logger.error(
                    "Database not reachable after %d attempts: %s", attempt, exc
                )
                sys.exit(1)
            logger.warning(
                "Database not ready (attempt %d/%d): %s — retrying in %.0fs",
                attempt,
                MAX_TRIES,
                exc,
                WAIT_SECONDS,
            )
            time.sleep(WAIT_SECONDS)


if __name__ == "__main__":
    init()
