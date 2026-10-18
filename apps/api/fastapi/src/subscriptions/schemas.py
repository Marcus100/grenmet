from typing import Annotated

from pydantic import EmailStr, Field, StringConstraints

from src.models import BaseModel


class SubscribeRequest(BaseModel):
    list_key: Annotated[
        str,
        StringConstraints(min_length=1, max_length=40, pattern=r"^[a-z0-9-]+$"),
    ] = Field(description="Mailing list key, e.g. 'signal'.")
    email: EmailStr = Field(max_length=254)


class SubscribeAccepted(BaseModel):
    message: str
