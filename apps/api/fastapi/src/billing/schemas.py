from pydantic import HttpUrl

from src.models import BaseModel


class CheckoutSessionPublic(BaseModel):
    id: str
    url: HttpUrl


class WebhookReceivedPublic(BaseModel):
    received: bool
