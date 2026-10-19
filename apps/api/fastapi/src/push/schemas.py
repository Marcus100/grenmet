from typing import Annotated
from urllib.parse import urlsplit

from pydantic import AfterValidator, Field, StringConstraints

from src.models import BaseModel

from .constants import ALLOWED_ENDPOINT_SUFFIXES, PUSH_LIST_KEYS


def endpoint_is_allowed(endpoint: str) -> bool:
    parts = urlsplit(endpoint)
    host = (parts.hostname or "").lower()
    return parts.scheme == "https" and any(
        host == suffix or host.endswith(f".{suffix}")
        for suffix in ALLOWED_ENDPOINT_SUFFIXES
    )


def _check_endpoint(value: str) -> str:
    if not endpoint_is_allowed(value):
        raise ValueError("Unsupported push service endpoint")
    return value


def _check_list_key(value: str) -> str:
    if value not in PUSH_LIST_KEYS:
        raise ValueError("Unknown push list")
    return value


Endpoint = Annotated[
    str,
    StringConstraints(min_length=10, max_length=2048),
    AfterValidator(_check_endpoint),
]
Base64UrlKey = Annotated[
    str, StringConstraints(min_length=8, max_length=255, pattern=r"^[A-Za-z0-9_-]+=*$")
]


class PushKeys(BaseModel):
    p256dh: Base64UrlKey
    auth: Base64UrlKey


class PushSubscribeRequest(BaseModel):
    list_key: Annotated[str, AfterValidator(_check_list_key)] = Field(
        default="gms-alerts", description="Push list key, e.g. 'gms-alerts'."
    )
    endpoint: Endpoint = Field(
        description="PushSubscription.endpoint from the browser."
    )
    keys: PushKeys


class PushUnsubscribeRequest(BaseModel):
    endpoint: Annotated[str, StringConstraints(min_length=10, max_length=2048)]


class PushAccepted(BaseModel):
    message: str


class VapidPublicKey(BaseModel):
    enabled: bool = Field(description="False when browser push is not configured.")
    public_key: str | None = Field(
        default=None, description="applicationServerKey for pushManager.subscribe."
    )
