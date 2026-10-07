"""Initialize permission and role definitions without creating accounts."""

from sqlalchemy.orm import Session

from src.auth import permissions
from src.database import engine


def main() -> None:
    with Session(engine) as session:
        permissions.seed_permissions_and_roles(session)


if __name__ == "__main__":
    main()
