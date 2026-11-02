import uuid

from src.models import BaseModel, UtcDateTime

AuditValue = str | int | float | bool | None


class AuditChangePublic(BaseModel):
    field: str
    old: AuditValue = None
    new: AuditValue = None
    # True when the reader may not see this field's values; old/new are then null.
    masked: bool = False


class AuditEntryPublic(BaseModel):
    id: uuid.UUID
    record_type: str
    record_label: str
    record_id: str
    action: str
    actor_user_id: uuid.UUID | None
    # "System" for scheduled jobs and other writes without a signed-in user.
    actor_name: str
    # How the actor signed in: "account" or "app"; null when not recorded (older
    # entries, system jobs). ``actor_app`` names the app for an "app" session.
    actor_session: str | None = None
    actor_app: str | None = None
    changes: list[AuditChangePublic]
    created_at: UtcDateTime
