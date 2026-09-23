import uuid

from pydantic import Field

from src.models import BaseModel, UtcDateTime


class NotificationPublic(BaseModel):
    id: uuid.UUID
    event_key: str
    title: str
    body: str
    link_path: str | None
    entity_type: str | None
    entity_id: str | None
    read_at: UtcDateTime | None
    created_at: UtcDateTime


class UnreadCountPublic(BaseModel):
    count: int


class NotificationPreferencePublic(BaseModel):
    event_key: str
    label: str
    description: str
    # False for notifications a person must receive by email (e.g. approvals).
    email_mutable: bool
    email_enabled: bool


class NotificationPreferenceUpdate(BaseModel):
    event_key: str
    email_enabled: bool


class NotificationParams(BaseModel):
    """Tunable timings. Each event uses only the ones it lists as defaults."""

    remind_after_days: int | None = Field(default=None, ge=1, le=365)
    escalate_after_days: int | None = Field(default=None, ge=1, le=365)
    # Days before an expiry date to send a reminder, e.g. [30, 7].
    expiry_days_before: list[int] | None = Field(
        default=None, min_length=1, max_length=5
    )


class NotificationSettingPublic(BaseModel):
    event_key: str
    label: str
    description: str
    audience: str
    variables: list[str]
    email_mutable: bool
    enabled: bool
    email_enabled: bool
    recipient_roles: list[str]
    title_template: str
    body_template: str
    default_title_template: str
    default_body_template: str
    params: NotificationParams
    # True once HR has saved this event for the organisation.
    customised: bool


class NotificationSettingUpdate(BaseModel):
    enabled: bool
    email_enabled: bool
    recipient_roles: list[str] = Field(default_factory=list, max_length=10)
    title_template: str | None = Field(default=None, max_length=200)
    body_template: str | None = Field(default=None, max_length=1000)
    params: NotificationParams = Field(default_factory=NotificationParams)


class UnreachableRecipientPublic(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str


class NotificationSettingsPublic(BaseModel):
    organisation_id: str
    # Empty means email may go to any domain.
    allowed_domains: list[str]
    events: list[NotificationSettingPublic]
    # Staff whose address is outside allowed_domains; they only see in-app.
    unreachable: list[UnreachableRecipientPublic]
