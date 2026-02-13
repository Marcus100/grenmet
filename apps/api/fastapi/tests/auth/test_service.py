from fastapi.encoders import jsonable_encoder
from sqlmodel import Session

from src.auth import service as crud
from src.auth.models import User
from src.auth.schemas import UserCreate, UserUpdate
from src.auth.utils import verify_password
from tests.utils.utils import random_email, random_lower_string


def test_create_user(db: Session) -> None:
    """Test creating a new user."""
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(
        email=email,
        username=random_lower_string(),
        password=password,
        first_name="Test",
        last_name="User"
    )
    user = crud.create_user(session=db, user_create=user_in)
    assert user.email == email
    assert hasattr(user, "hashed_password")


def test_authenticate_user(db: Session) -> None:
    """Test user authentication with correct credentials."""
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(
        email=email,
        username=random_lower_string(),
        password=password,
        first_name="Test",
        last_name="User"
    )
    user = crud.create_user(session=db, user_create=user_in)
    authenticated_user = crud.authenticate(session=db, email=email, password=password)
    assert authenticated_user
    assert user.email == authenticated_user.email


def test_not_authenticate_user(db: Session) -> None:
    """Test user authentication with incorrect credentials."""
    email = random_email()
    password = random_lower_string()
    user = crud.authenticate(session=db, email=email, password=password)
    assert user is None


def test_check_if_user_is_active(db: Session) -> None:
    """Test checking if user is active."""
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(
        email=email,
        username=random_lower_string(),
        password=password,
        first_name="Test",
        last_name="User"
    )
    user = crud.create_user(session=db, user_create=user_in)
    assert user.is_active is True


def test_check_if_user_is_active_inactive(db: Session) -> None:
    """Test checking if inactive user is active."""
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(
        email=email,
        username=random_lower_string(),
        password=password,
        first_name="Test",
        last_name="User",
        is_active=False
    )
    user = crud.create_user(session=db, user_create=user_in)
    assert user.is_active is False


def test_check_if_user_is_superuser(db: Session) -> None:
    """Test checking if user is superuser."""
    email = random_email()
    password = random_lower_string()
    user_in = UserCreate(
        email=email,
        username=random_lower_string(),
        password=password,
        first_name="Test",
        last_name="User",
        is_superuser=True
    )
    user = crud.create_user(session=db, user_create=user_in)
    assert user.is_superuser is True


def test_check_if_user_is_superuser_normal_user(db: Session) -> None:
    """Test checking if normal user is superuser."""
    username = random_email()
    password = random_lower_string()
    user_in = UserCreate(
        email=username,
        username=username.split('@')[0],
        password=password,
        first_name="Test",
        last_name="User"
    )
    user = crud.create_user(session=db, user_create=user_in)
    assert user.is_superuser is False


def test_get_user(db: Session) -> None:
    """Test getting a user by ID."""
    password = random_lower_string()
    username = random_email()
    user_in = UserCreate(
        email=username,
        username=username.split('@')[0],
        password=password,
        first_name="Test",
        last_name="User",
        is_superuser=True
    )
    user = crud.create_user(session=db, user_create=user_in)
    user_2 = db.get(User, user.id)
    assert user_2
    assert user.email == user_2.email
    assert jsonable_encoder(user) == jsonable_encoder(user_2)


def test_update_user(db: Session) -> None:
    """Test updating a user."""
    password = random_lower_string()
    email = random_email()
    user_in = UserCreate(
        email=email,
        username=random_lower_string(),
        password=password,
        first_name="Test",
        last_name="User",
        is_superuser=True
    )
    user = crud.create_user(session=db, user_create=user_in)
    new_password = random_lower_string()
    user_in_update = UserUpdate(password=new_password, is_superuser=True)
    if user.id is not None:
        crud.update_user(session=db, db_user=user, user_in=user_in_update)
    user_2 = db.get(User, user.id)
    assert user_2
    assert user.email == user_2.email
    assert verify_password(new_password, user_2.hashed_password)
