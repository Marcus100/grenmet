from datetime import datetime
from zoneinfo import ZoneInfo

from fastapi.encoders import jsonable_encoder
from pydantic import BaseModel as PydanticBaseModel
from pydantic import ConfigDict


def datetime_to_gmt_str(dt: datetime) -> str:
    if not dt.tzinfo:
        dt = dt.replace(tzinfo=ZoneInfo("UTC"))
    return dt.strftime("%Y-%m-%dT%H:%M:%S%z")


class CustomModel(PydanticBaseModel):
    """Custom base model with global configurations."""

    model_config = ConfigDict(
        json_encoders={datetime: datetime_to_gmt_str},
        populate_by_name=True,
    )

    def model_dump_json(self, **kwargs: object) -> str:  # noqa: ARG002
        """Return a dict which contains only serializable fields."""
        default_dict = self.model_dump()
        return str(jsonable_encoder(default_dict))


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
