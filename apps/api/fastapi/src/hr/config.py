from pydantic import BaseModel

from src.config import settings


class HrSettings(BaseModel):
    environment: str
    api_v1_str: str


def get_hr_settings() -> HrSettings:
    """Return HR-focused settings wrapper for domain-level imports."""
    return HrSettings(
        environment=settings.ENVIRONMENT,
        api_v1_str=settings.API_V1_STR,
    )
