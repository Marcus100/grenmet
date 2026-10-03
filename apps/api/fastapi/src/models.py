from datetime import datetime
from typing import Annotated, Any, cast
from zoneinfo import ZoneInfo

from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel as PydanticBaseModel
from pydantic import ConfigDict, PlainSerializer, WithJsonSchema


def datetime_to_gmt_str(dt: datetime) -> str:
    """Serialize datetime to consistent GMT string for API responses."""
    if not dt.tzinfo:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.astimezone(ZoneInfo("UTC")).strftime("%Y-%m-%dT%H:%M:%SZ")


# DB datetimes are stored naive-UTC (see src.utils.datetime.utc_now); this
# annotation stamps them as UTC on the way out so clients never misread them
# as local time. Every datetime field on an API schema must use UtcDateTime,
# not bare datetime — enforced by tests/test_schema_datetime_guard.py. A
# model-level serializer would be less repetitive, but it collapses the
# OpenAPI serialization schema of every response model to {} (untyped return),
# which silently untypes the generated TS client.
UtcDateTime = Annotated[
    datetime,
    PlainSerializer(datetime_to_gmt_str, return_type=str, when_used="json"),
    WithJsonSchema({"type": "string", "format": "date-time"}, mode="serialization"),
]


class CustomModel(PydanticBaseModel):
    """Custom base model with global configurations."""

    model_config = ConfigDict(
        populate_by_name=True,
    )

    def serializable_dict(self) -> dict[str, Any]:
        """Return a dict which contains only serializable fields (for JSON)."""
        return cast(dict[str, Any], jsonable_encoder(self.model_dump()))


# Export CustomModel as BaseModel for consistency across the app
BaseModel = CustomModel


class ApiError(BaseModel):
    """Stable error envelope for documented API failures."""

    detail: str


class ValidationErrorItem(BaseModel):
    """A single request validation failure."""

    type: str
    loc: list[str | int]
    msg: str


class ValidationErrorResponse(BaseModel):
    """Validation error envelope returned for malformed requests."""

    detail: str = "Validation error"
    errors: list[ValidationErrorItem]


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
