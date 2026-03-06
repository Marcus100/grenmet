from collections.abc import Callable
from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel as PydanticBaseModel
from pydantic import ConfigDict, model_serializer


def datetime_to_gmt_str(dt: datetime) -> str:
    """Serialize datetime to consistent GMT string for API responses."""
    if not dt.tzinfo:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.strftime("%Y-%m-%dT%H:%M:%S%z")


def _serialize_value(v: object) -> object:
    """Recursively serialize values for JSON; datetimes to GMT string."""
    if isinstance(v, datetime):
        return datetime_to_gmt_str(v)
    if isinstance(v, dict):
        return {k: _serialize_value(val) for k, val in v.items()}
    if isinstance(v, list):
        return [_serialize_value(item) for item in v]
    return v


class CustomModel(PydanticBaseModel):
    """Custom base model with global configurations and consistent datetime serialization."""

    model_config = ConfigDict(
        populate_by_name=True,
    )

    @model_serializer(mode="wrap")
    def _serialize_model(self, serializer: Callable[..., object]) -> object:
        """Serialize model for JSON; convert datetime fields to GMT string."""
        data = serializer(self)
        return _serialize_value(data)

    def serializable_dict(self) -> dict:
        """Return a dict which contains only serializable fields (for JSON)."""
        return jsonable_encoder(self.model_dump())


# Export CustomModel as BaseModel for consistency across the app
BaseModel = CustomModel


# Generic message
class Message(BaseModel):
    message: str


# JSON payload containing access token
class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# Contents of JWT token
class TokenPayload(BaseModel):
    sub: str | None = None
