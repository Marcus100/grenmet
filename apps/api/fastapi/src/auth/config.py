from pydantic import BaseModel

from src.config import settings


class AuthSettings(BaseModel):
    api_v1_str: str
    access_token_expire_minutes: int
    secret_key: str


def get_auth_settings() -> AuthSettings:
    """Return auth-focused settings without changing global config contracts."""
    return AuthSettings(
        api_v1_str=settings.API_V1_STR,
        access_token_expire_minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES,
        secret_key=settings.SECRET_KEY,
    )
