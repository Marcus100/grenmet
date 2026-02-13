from fastapi.testclient import TestClient
from sqlmodel import Session, select

from src.config import settings
from src.auth.models import User


def test_create_user(client: TestClient, db: Session) -> None:
    """Test creating a user via API."""
    r = client.post(
        f"{settings.API_V1_STR}/auth/users/signup",
        json={
            "email": "pollo@listo.com",
            "username": "pollolisto",
            "password": "password123",
            "first_name": "Pollo",
            "last_name": "Listo",
        },
    )

    assert r.status_code == 201

    data = r.json()

    user = db.exec(select(User).where(User.id == data["id"])).first()

    assert user
    assert user.email == "pollo@listo.com"
    assert user.full_name == "Pollo Listo"