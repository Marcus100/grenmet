"""Flush listener that records field-level changes of tracked models.

Runs in ``after_flush``: primary keys are assigned by then, while attribute
history and ``session.new``/``dirty``/``deleted`` still describe the flush. Rows
are inserted through the session's connection, so an audit entry commits or
rolls back with the change it describes.

Bulk ``update()``/``delete()`` statements bypass the ORM unit of work and are not
seen here; call :func:`src.audit.service.record_change` for those.
"""

import enum
import uuid
from collections.abc import Mapping
from datetime import date, datetime, time
from decimal import Decimal
from typing import Any

from sqlalchemy import event, insert, inspect
from sqlalchemy.orm import InstanceState, Session, UOWTransaction

from src.utils.datetime import utc_now

from . import registry
from .models import AuditEntry

ACTOR_KEY = "actor_id"
#: ``(kind, app)`` of the actor's sign-in: ``("account", None)`` or ``("app", "events")``.
ACTOR_SESSION_KEY = "actor_session"


def actor_session_fields(info: Mapping[str, Any]) -> tuple[str | None, str | None]:
    """The ``(actor_session, actor_app)`` columns for rows written in a session.

    ``info`` is that session's ``info`` mapping (``session.info``)."""
    value = info.get(ACTOR_SESSION_KEY)
    if not value:
        return None, None
    kind, app = value
    return kind, app


def json_value(value: Any) -> Any:
    if value is None or isinstance(value, bool | int | float | str):
        return value
    if isinstance(value, enum.Enum):
        return value.value
    if isinstance(value, datetime | date | time):
        return value.isoformat()
    if isinstance(value, uuid.UUID | Decimal):
        return str(value)
    if isinstance(value, list | tuple):
        return [json_value(item) for item in value]
    if isinstance(value, dict):
        return {str(key): json_value(item) for key, item in value.items()}
    return str(value)


def _state(obj: object) -> InstanceState[Any]:
    state = inspect(obj)
    assert isinstance(state, InstanceState)
    return state


def _column_keys(obj: object, spec: registry.TrackedModel) -> list[str]:
    return [
        attr.key
        for attr in _state(obj).mapper.column_attrs
        if attr.key not in spec.exclude
    ]


def _snapshot(
    obj: object, spec: registry.TrackedModel, *, created: bool
) -> list[dict[str, Any]]:
    changes = []
    for key in _column_keys(obj, spec):
        value = json_value(getattr(obj, key, None))
        if value is None:
            continue
        old, new = (None, value) if created else (value, None)
        changes.append(
            {"field": key, "old": old, "new": new, "sensitive": key in spec.sensitive}
        )
    return changes


def _diff(obj: object, spec: registry.TrackedModel) -> list[dict[str, Any]]:
    state = _state(obj)
    changes = []
    for key in _column_keys(obj, spec):
        history = state.attrs[key].history
        if not history.has_changes():
            continue
        old = json_value(history.deleted[0]) if history.deleted else None
        new = json_value(history.added[0]) if history.added else None
        if old == new:
            continue
        changes.append(
            {"field": key, "old": old, "new": new, "sensitive": key in spec.sensitive}
        )
    return changes


def build_row(
    obj: object,
    spec: registry.TrackedModel,
    *,
    action: str,
    changes: list[dict[str, Any]],
    actor_id: uuid.UUID | None,
    actor_session: str | None = None,
    actor_app: str | None = None,
) -> dict[str, Any]:
    return {
        "id": uuid.uuid4(),
        "entity_type": spec.entity_type,
        "entity_id": str(getattr(obj, spec.entity_id_attr)),
        "record_type": spec.record_type,
        # identity keys are only assigned after after_flush; read the PK directly.
        "record_id": ":".join(
            str(part) for part in _state(obj).mapper.primary_key_from_instance(obj)
        ),
        "organisation_id": getattr(obj, "organisation_id", None),
        "action": action,
        "actor_user_id": actor_id,
        "actor_session": actor_session,
        "actor_app": actor_app,
        "changes": changes,
        "created_at": utc_now(),
    }


@event.listens_for(Session, "after_flush")
def _record_changes(session: Session, _flush_context: UOWTransaction) -> None:
    actor_id = session.info.get(ACTOR_KEY)
    actor_kind, actor_app = actor_session_fields(session.info)
    rows: list[dict[str, Any]] = []
    for action, objects in (
        ("create", session.new),
        ("update", session.dirty),
        ("delete", session.deleted),
    ):
        for obj in objects:
            spec = registry.tracked(type(obj))
            if spec is None:
                continue
            if action == "update":
                if not session.is_modified(obj, include_collections=False):
                    continue
                changes = _diff(obj, spec)
                if not changes:
                    continue
            else:
                changes = _snapshot(obj, spec, created=action == "create")
            rows.append(
                build_row(
                    obj,
                    spec,
                    action=action,
                    changes=changes,
                    actor_id=actor_id,
                    actor_session=actor_kind,
                    actor_app=actor_app,
                )
            )
    if rows:
        session.connection().execute(insert(AuditEntry), rows)
