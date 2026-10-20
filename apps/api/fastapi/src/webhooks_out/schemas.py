from typing import Annotated, Any

from pydantic import Field, StringConstraints

from src.models import BaseModel, UtcDateTime

from .models import DeliveryStatus, EndpointStatus

EndpointUrl = Annotated[str, StringConstraints(min_length=8, max_length=2048)]
EventTypeKey = Annotated[str, StringConstraints(min_length=1, max_length=60)]


class WebhookEndpointCreate(BaseModel):
    url: EndpointUrl
    description: Annotated[str, StringConstraints(max_length=255)] | None = None
    event_types: Annotated[list[EventTypeKey], Field(min_length=1, max_length=20)]


class WebhookEndpointUpdate(BaseModel):
    url: EndpointUrl | None = None
    description: Annotated[str, StringConstraints(max_length=255)] | None = None
    event_types: (
        Annotated[list[EventTypeKey], Field(min_length=1, max_length=20)] | None
    ) = None
    status: EndpointStatus | None = None


class WebhookEndpointPublic(BaseModel):
    """Never carries the signing secret."""

    id: str
    organisation_id: str
    url: str
    description: str | None = None
    event_types: list[str]
    status: EndpointStatus
    consecutive_failures: int
    disabled_reason: str | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class WebhookEndpointCreated(WebhookEndpointPublic):
    """The only response that holds the signing secret (create and rotate)."""

    secret: str


class WebhookEndpointList(BaseModel):
    data: list[WebhookEndpointPublic]
    count: int
    page: int
    size: int


class WebhookDeliveryPublic(BaseModel):
    id: str
    endpoint_id: str
    event_id: str
    event_type: str
    attempts: int
    status: DeliveryStatus
    response_status: int | None = None
    last_error: str | None = None
    next_attempt_at: UtcDateTime | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class WebhookDeliveryList(BaseModel):
    data: list[WebhookDeliveryPublic]
    count: int
    page: int
    size: int


class WebhookEventTypePublic(BaseModel):
    key: str
    description: str
    data_schema: dict[str, Any]


class WebhookEventTypeList(BaseModel):
    data: list[WebhookEventTypePublic]


class WebhookTestResult(BaseModel):
    """Outcome of a synchronous ping. A failed ping does not count towards
    auto-disable."""

    delivered: bool
    response_status: int | None = None
    error: str | None = None
    duration_ms: int


class WebhookAdminDisable(BaseModel):
    reason: Annotated[str, StringConstraints(min_length=1, max_length=200)]
