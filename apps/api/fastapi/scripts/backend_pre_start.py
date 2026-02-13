#!/usr/bin/env python3
"""
Backend pre-start script.

This script runs before the API starts to ensure the database is ready.
It's called by the prestart.sh script during container startup.
"""

import logging
import sys

from sqlmodel import Session, create_engine, text

from src.config import settings

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def init() -> None:
    """Initialize the database connection and verify it's working."""
    logger.info("Initializing service")

    try:
        # Create engine
        engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))

        # Test connection
        with Session(engine) as session:
            # Simple query to test connection
            result = session.exec(text("SELECT 1")).first()
            if result:
                logger.info("Service finished initializing")
            else:
                logger.error("Database connection test failed")
                sys.exit(1)

    except Exception as e:
        logger.error("Failed to initialize database connection: %s", e)
        sys.exit(1)


if __name__ == "__main__":
    init()
