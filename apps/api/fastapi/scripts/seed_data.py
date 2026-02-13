"""
Seed database with test data for development.

Custom Users:
    Edit the CUSTOM_USERS list at the top of this file to define your custom users.
    Only users defined in CUSTOM_USERS will be created (no automatic generic users).
    Items are automatically created for all custom users.

Usage:
    python scripts/seed_data.py                    # Create all custom users, 3 items each
    python scripts/seed_data.py --count 2          # Create first 2 custom users
    python scripts/seed_data.py --reset            # Clear existing seed data first
    python scripts/seed_data.py --items-per-user 5 # Create 5 items per user
"""

import argparse
import logging
import sys

from sqlalchemy import or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select, col

from src.auth.models import User
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.database import engine
from src.items.models import Item

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Custom users to create - edit this list to add your own users
# Only users defined here will be created (no automatic generic users)
CUSTOM_USERS = [
    {
        "email": "ewhint@weather.gd",
        "username": "ewhint",
        "password": "securepass123",
        "first_name": "Eugine",
        "middle_name": None,
        "last_name": "Whint",
        "is_active": True,
        "is_superuser": True,
    },
    {
        "email": "acharles@weather.gd",
        "username": "acharles",
        "password": "securepass123",
        "first_name": "Andre",
        "middle_name": None,
        "last_name": "Charles",
        "is_active": True,
        "is_superuser": False,
    },
    {
        "email": "ffrank@weather.gd",
        "username": "ffrank",
        "password": "securepass123",
        "first_name": "Fimber",
        "middle_name": None,
        "last_name": "Frank",
        "is_active": True,
        "is_superuser": False,
    },
    {
        "email": "kjohnson@weather.gd",
        "username": "kjohnson",
        "password": "securepass123",
        "first_name": "Kassia",
        "middle_name": None,
        "last_name": "Johnson",
        "is_active": True,
        "is_superuser": False,
    },
    {
        "email": "tmiller@weather.gd",
        "username": "tmiller",
        "password": "securepass123",
        "first_name": "Trisha",
        "middle_name": None,
        "last_name": "Miller",
        "is_active": True,
        "is_superuser": False,
    },
    {
        "email": "jpryce@weather.gd",
        "username": "jpryce",
        "password": "securepass123",
        "first_name": "Jim",
        "middle_name": None,
        "last_name": "Beam",
        "is_active": True,
        "is_superuser": False,
    },
    {
        "email": "vcyrus@weather.gd",
        "username": "vcyrus",
        "password": "securepass123",
        "first_name": "Vondi",
        "middle_name": None,
        "last_name": "Cyrus",
        "is_active": True,
        "is_superuser": False,
    },
    {
        "email": "njones@weather.gd",
        "username": "njones",
        "password": "securepass123",
        "first_name": "Nicole",
        "middle_name": None,
        "last_name": "Jones",
        "is_active": True,
        "is_superuser": False,
    },
    {
        "email": "dbedeau@weather.gd",
        "username": "dbedeau",
        "password": "securepass123",
        "first_name": "Dieonne",
        "middle_name": None,
        "last_name": "Bedeau",
        "is_active": True,
        "is_superuser": False,
    },
    {
        "email": "kclarke@weather.gd",
        "username": "kclark",
        "password": "securepass123",
        "first_name": "Kendra",
        "middle_name": None,
        "last_name": "Clarke",
        "is_active": True,
        "is_superuser": False,
    },
    {
        "email": "nicole@weather.gd",
        "username": "njones",
        "password": "securepass123",
        "first_name": "Nicole",
        "middle_name": None,
        "last_name": "Jones",
        "is_active": True,
        "is_superuser": False,
    },
    {
        "email": "scummings@weather.gd",
        "username": "scummings",
        "password": "securepass123",
        "first_name": "Swayne",
        "middle_name": None,
        "last_name": "Cummings",
        "is_active": True,
        "is_superuser": False,
    },
    {
        "email": "jfleming@weather.gd",
        "username": "njones",
        "password": "securepass123",
        "first_name": "Jeriann",
        "middle_name": None,
        "last_name": "Fleming",
        "is_active": True,
        "is_superuser": False,
    },
    {
        "email": "nicole@weather.gd",
        "username": "njones",
        "password": "securepass123",
        "first_name": "Nicole",
        "middle_name": None,
        "last_name": "Jones",
        "is_active": True,
        "is_superuser": False,
    },
    {
        "email": "nicole@weather.gd",
        "username": "njones",
        "password": "securepass123",
        "first_name": "Nicole",
        "middle_name": None,
        "last_name": "Jones",
        "is_active": True,
        "is_superuser": False,
    },
]


def clear_seed_data(session: Session) -> tuple[int, int]:
    """Clear existing seed data (test users and their items)."""
    logger.info("Clearing existing seed data...")

    # Find all test users
    # Fetch all users and filter in Python to avoid linter issues with SQLModel FieldInfo
    all_users = session.exec(select(User)).all()
    test_users = [
        u
        for u in all_users
        if u.email.startswith("testuser") and u.email.endswith("@barrels.gd")
    ]

    user_count = len(test_users)
    item_count = 0

    if test_users:
        # Delete items for these users
        # Use SQL filtering for better performance with large datasets
        user_ids = [user.id for user in test_users]
        conditions = [col(Item.owner_id) == uid for uid in user_ids]
        items = session.exec(select(Item).where(or_(*conditions))).all()
        item_count = len(items)

        for item in items:
            session.delete(item)

        # Delete users
        for user in test_users:
            session.delete(user)

        session.commit()
        logger.info("Cleared %d users and %d items", user_count, item_count)
    else:
        logger.info("No seed data found to clear")

    return user_count, item_count


def _create_user_from_data(
    session: Session, user_data: dict, users: list[User]
) -> tuple[int, int]:
    """Helper function to create a single user from user_data dict."""
    created_count = 0
    existing_count = 0

    # Set defaults for optional fields
    user_in = UserCreate(
        email=user_data["email"],
        username=user_data["username"],
        password=user_data["password"],
        first_name=user_data["first_name"],
        middle_name=user_data.get("middle_name"),
        last_name=user_data["last_name"],
        is_active=user_data.get("is_active", True),
        is_superuser=user_data.get("is_superuser", False),
    )

    # Check if user already exists
    existing_user = session.exec(
        select(User).where(User.email == user_in.email)
    ).first()

    if existing_user:
        users.append(existing_user)
        existing_count += 1
        logger.debug("User already exists: %s", user_in.email)
    else:
        try:
            user = create_user(session=session, user_create=user_in)
            users.append(user)
            created_count += 1
            logger.info("Created user: %s", user.email)
        except IntegrityError as e:
            logger.warning("Failed to create user %s: %s", user_in.email, e)
            # Try to get the user that might have been created concurrently
            user = session.exec(select(User).where(User.email == user_in.email)).first()
            if user:
                users.append(user)
                existing_count += 1

    return created_count, existing_count


def create_test_users(session: Session, count: int = 5) -> list[User]:
    """Create custom users from CUSTOM_USERS list. Returns list of created or existing users.

    Only creates users defined in CUSTOM_USERS. If count > len(CUSTOM_USERS),
    only the available custom users will be created.
    """
    users = []
    created_count = 0
    existing_count = 0

    # Warn if count exceeds available custom users
    if count > len(CUSTOM_USERS):
        logger.warning(
            "Requested %d users but only %d custom users defined. "
            "Creating all available custom users.",
            count,
            len(CUSTOM_USERS),
        )
        count = len(CUSTOM_USERS)

    # Create custom users (up to the requested count)
    custom_users_to_create = CUSTOM_USERS[:count]
    for user_data in custom_users_to_create:
        created, existing = _create_user_from_data(session, user_data, users)
        created_count += created
        existing_count += existing

    session.commit()
    logger.info("Users: %d created, %d already existed", created_count, existing_count)
    return users


def create_test_items(
    session: Session, users: list[User], items_per_user: int = 3
) -> tuple[int, int]:
    """Create test items for users. Returns (created_count, skipped_count)."""
    created_count = 0
    skipped_count = 0

    for user in users:
        # Check how many items this user already has
        existing_items = session.exec(
            select(Item).where(col(Item.owner_id) == user.id)
        ).all()
        existing_count = len(existing_items)

        # Only create items if user has fewer than requested
        items_to_create = max(0, items_per_user - existing_count)

        # Use bulk operations for better performance
        items_to_add = [
            Item(
                title=f"Test Item {existing_count + i + 1} for {user.username}",
                description=f"This is a test item description {existing_count + i + 1}",
                content=(
                    f"Detailed content for Test Item {existing_count + i + 1}. "
                    f"This item belongs to {user.username} and contains comprehensive information "
                    f"about the item. It includes various details, descriptions, and metadata that "
                    f"would be typical for a real-world application item."
                ),
                owner_id=user.id,
            )
            for i in range(items_to_create)
        ]

        if items_to_add:
            session.add_all(items_to_add)
            created_count += len(items_to_add)
            for item in items_to_add:
                logger.debug("Created item: %s", item.title)

        if items_to_create == 0:
            skipped_count += items_per_user
            logger.debug(
                "User %s already has %d items, skipping", user.username, existing_count
            )

    session.commit()
    return created_count, skipped_count


def main():
    """Main seeding function with command-line arguments."""
    parser = argparse.ArgumentParser(
        description="Seed database with test data for development"
    )
    parser.add_argument(
        "--count",
        type=int,
        default=None,
        help="Number of custom users to create from CUSTOM_USERS list (default: all custom users)",
    )
    parser.add_argument(
        "--items-per-user",
        type=int,
        default=3,
        help="Number of items per user (default: 3)",
    )
    parser.add_argument(
        "--reset",
        action="store_true",
        help="Clear existing seed data before creating new data",
    )
    parser.add_argument(
        "--verbose",
        "-v",
        action="store_true",
        help="Enable verbose logging",
    )

    args = parser.parse_args()

    # Set default count to all custom users if not specified
    if args.count is None:
        args.count = len(CUSTOM_USERS)

    # Validate input arguments
    if args.count < 0:
        parser.error("--count must be non-negative")
    if args.items_per_user < 0:
        parser.error("--items-per-user must be non-negative")
    if args.count > len(CUSTOM_USERS):
        logger.warning(
            "Requested %d users but only %d custom users available. "
            "Will create all %d custom users.",
            args.count,
            len(CUSTOM_USERS),
            len(CUSTOM_USERS),
        )
        args.count = len(CUSTOM_USERS)

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    logger.info("=" * 60)
    logger.info("Starting database seeding...")
    logger.info(
        "Configuration: %d custom users, %d items each", args.count, args.items_per_user
    )
    if args.reset:
        logger.info("Reset mode: Will clear existing seed data first")
    logger.info("=" * 60)

    session = Session(engine)
    try:
        # Clear existing data if requested
        if args.reset:
            cleared_users, cleared_items = clear_seed_data(session)
            logger.info("Cleared: %d users, %d items", cleared_users, cleared_items)

        # Create custom users
        logger.info("Creating custom users from CUSTOM_USERS list...")
        users = create_test_users(session, count=args.count)

        if not users:
            logger.error(
                "No users available to create items for. Please add users to CUSTOM_USERS list."
            )
            session.rollback()
            sys.exit(1)

        # Create test items (automated)
        logger.info("Creating %d items per user (automated)...", args.items_per_user)
        items_created, items_skipped = create_test_items(
            session, users, items_per_user=args.items_per_user
        )

        # Summary
        logger.info("=" * 60)
        logger.info("Database seeding completed!")
        logger.info("Users: %d total (all from CUSTOM_USERS)", len(users))
        logger.info(
            "Items: %d created, %d skipped (already existed)",
            items_created,
            items_skipped,
        )
        logger.info("=" * 60)
        if users:
            first_user = users[0]
            logger.info(
                "Sample credentials: %s / (see CUSTOM_USERS for password)",
                first_user.email,
            )

    except Exception as e:
        logger.error("Failed to seed database: %s", e, exc_info=True)
        # Explicitly rollback transaction on error
        try:
            session.rollback()
        except Exception:
            pass  # Session may already be closed or rolled back
        sys.exit(1)
    finally:
        session.close()


if __name__ == "__main__":
    main()
