"""
Clear seed data from the database.

Usage:
    python scripts/clear_seed_data.py
"""

import logging
import sys

from sqlmodel import Session, select

from src.auth.models import User
from src.database import engine

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def main():
    """Clear all seed data (test users)."""
    logger.info("=" * 60)
    logger.info("Clearing seed data...")
    logger.info("=" * 60)

    try:
        with Session(engine) as session:
            # Find all test users
            test_users = session.exec(
                select(User).where(User.email.like("testuser%@weather.gd"))
            ).all()

            if not test_users:
                logger.info("No seed data found to clear")
                return

            for user in test_users:
                session.delete(user)

            session.commit()

            logger.info("=" * 60)
            logger.info(f"Successfully cleared {len(test_users)} users")
            logger.info("=" * 60)

    except Exception as e:
        logger.error(f"Failed to clear seed data: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
