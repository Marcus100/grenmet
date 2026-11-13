"""Profile photo history, read as part of the person's employee record.

The storage location is never copied into history.
"""

from src.audit import registry
from src.auth.models import UserImage


def register() -> None:
    registry.track(
        UserImage,
        record_type="profile_image",
        entity_type="employee",
        entity_id_attr="user_id",
        exclude=("object_key",),
        label="Profile photo",
    )
