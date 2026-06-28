#!/usr/bin/env python3
"""
Initial data script.

This script creates initial data in the database, including the first superuser.
It's called by the prestart.sh script during container startup.
"""

import logging

from sqlmodel import Session

from src.auth.permissions import seed_permissions_and_roles
from src.config import settings
from src.database import engine, init_db

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main() -> None:
    """Create initial data: first superuser + permission catalog + default roles."""
    logger.info("Creating initial data")

    try:
        with Session(engine) as session:
            init_db(session)
            session.commit()
            seed_permissions_and_roles(session)
            logger.info("Initial data created (superuser, permissions, roles)")
    except Exception as e:
        logger.error("Failed to create initial data: %s", e)
        raise


if __name__ == "__main__":
    main()
