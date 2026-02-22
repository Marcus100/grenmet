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
from src.items.models import Item

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


def main():
    """Clear all seed data (test users and their items)."""
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

            # Delete items for these users
            user_ids = [user.id for user in test_users]
            items = session.exec(select(Item).where(Item.owner_id.in_(user_ids))).all()

            for item in items:
                session.delete(item)

            # Delete users
            for user in test_users:
                session.delete(user)

            session.commit()

            logger.info("=" * 60)
            logger.info(
                f"Successfully cleared {len(test_users)} users and {len(items)} items"
            )
            logger.info("=" * 60)

    except Exception as e:
        logger.error(f"Failed to clear seed data: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
