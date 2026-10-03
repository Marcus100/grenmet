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
    changes: list[AuditChangePublic]
    created_at: UtcDateTime
