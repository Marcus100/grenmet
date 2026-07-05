"""Guards for API schema serialization.

Two regressions this file pins down:

1. Every datetime field on an API schema must be UtcDateTime (src.models),
   never bare datetime — DB datetimes are naive UTC and a bare field would
   serialize without an offset, which clients misread as local time.
2. No response model may have an empty serialization schema. A model-level
   serializer with an untyped return once collapsed 48 component schemas in
   openapi.json to {}, silently untyping the generated TypeScript client.
"""

from datetime import datetime
from typing import Annotated, get_args, get_origin

from pydantic import PlainSerializer

import src.main  # noqa: F401  # imports every router so all schemas register
from src.models import CustomModel


def _all_subclasses(cls: type) -> set[type]:
    subs: set[type] = set()
    for sub in cls.__subclasses__():
        subs.add(sub)
        subs |= _all_subclasses(sub)
    return subs


def _tree_ok(ann: object) -> bool:
    """True unless a bare (un-serialized) datetime appears in the annotation."""
    if ann is datetime:
        return False
    if get_origin(ann) is Annotated:
        args = get_args(ann)
        base, meta = args[0], args[1:]
        if base is datetime:
            return any(isinstance(m, PlainSerializer) for m in meta)
        return _tree_ok(base)
    return all(_tree_ok(a) for a in get_args(ann))


def test_no_bare_datetime_fields_on_api_schemas() -> None:
    offenders: list[str] = []
    for model in _all_subclasses(CustomModel):
        for name, field in model.model_fields.items():
            if field.annotation is datetime:
                ok = any(isinstance(m, PlainSerializer) for m in field.metadata)
            else:
                ok = _tree_ok(field.annotation)
            if not ok:
                offenders.append(f"{model.__module__}.{model.__name__}.{name}")
    assert not offenders, (
        "Bare datetime fields on API schemas (use UtcDateTime from src.models): "
        + ", ".join(sorted(offenders))
    )


def test_serialization_schemas_are_not_empty() -> None:
    offenders: list[str] = []
    for model in _all_subclasses(CustomModel):
        if not model.model_fields:
            continue
        schema = model.model_json_schema(mode="serialization")
        if not schema.get("properties"):
            offenders.append(f"{model.__module__}.{model.__name__}")
    assert not offenders, (
        "Models with empty serialization schema (breaks OpenAPI/TS client): "
        + ", ".join(sorted(offenders))
    )
