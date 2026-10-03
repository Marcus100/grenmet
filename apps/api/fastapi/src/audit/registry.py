"""Opt-in registry of audited models and the read check for each history subject."""

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User

ReadCheck = Callable[[AsyncSession, User, str], Awaitable[bool]]

# Bookkeeping columns every model carries; their churn is noise in a history.
DEFAULT_EXCLUDE = frozenset({"created_at", "updated_at"})


@dataclass(frozen=True)
class TrackedModel:
    record_type: str
    entity_type: str
    entity_id_attr: str
    exclude: frozenset[str]
    sensitive: frozenset[str]
    label: str


_models: dict[type, TrackedModel] = {}
_read_checks: dict[str, ReadCheck] = {}
_labels: dict[str, str] = {}


def track(
    model: type,
    *,
    record_type: str,
    entity_type: str | None = None,
    entity_id_attr: str = "id",
    exclude: tuple[str, ...] = (),
    sensitive: tuple[str, ...] = (),
    label: str | None = None,
) -> None:
    """Audit every insert/update/delete of ``model``.

    ``entity_type`` groups the row under a history subject (defaults to its own
    ``record_type``), read via ``entity_id_attr``. ``sensitive`` values are
    stored but masked for readers without ``audit.view_sensitive``.
    """
    _models[model] = TrackedModel(
        record_type=record_type,
        entity_type=entity_type or record_type,
        entity_id_attr=entity_id_attr,
        exclude=DEFAULT_EXCLUDE | frozenset(exclude),
        sensitive=frozenset(sensitive),
        label=label or record_type.replace("_", " ").capitalize(),
    )
    _labels[record_type] = label or record_type.replace("_", " ").capitalize()


def register_entity(entity_type: str, read_check: ReadCheck) -> None:
    """Declare who may read the history of ``entity_type`` subjects.

    The check must answer exactly as the owning module's own read access would,
    so history is never visible to someone who cannot see the record.
    """
    _read_checks[entity_type] = read_check


def tracked(model: type) -> TrackedModel | None:
    return _models.get(model)


def read_check(entity_type: str) -> ReadCheck | None:
    return _read_checks.get(entity_type)


def record_label(record_type: str) -> str:
    return _labels.get(record_type, record_type)


def parse_uuid(value: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(value)
    except ValueError:
        return None
