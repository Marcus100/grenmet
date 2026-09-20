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
from typing import Annotated, Any, get_args, get_origin

from pydantic import PlainSerializer

import src.main  # noqa: F401  # imports every router so all schemas register
from src.main import app
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


ROUTE_METADATA_EXEMPTIONS = {
    "get_scalar_docs": "documentation endpoint returns HTML, not JSON",
}


def test_json_routes_declare_response_models_and_metadata() -> None:
    from fastapi.routing import APIRoute

    offenders: list[str] = []
    for route in app.routes:
        if not isinstance(route, APIRoute):
            continue
        if route.name in ROUTE_METADATA_EXEMPTIONS:
            continue
        if route.response_model is None:
            offenders.append(f"{route.name}: response_model")
        if not route.summary:
            offenders.append(f"{route.name}: summary")
        if not route.description:
            offenders.append(f"{route.name}: description")
        if not route.responses:
            offenders.append(f"{route.name}: responses")
    assert not offenders, "Routes missing contract metadata: " + ", ".join(
        sorted(offenders)
    )


MAP_TYPE_EXEMPTIONS = {
    "src.cap.schemas.CapAuditEventPublic.payload": "audit payload is versioned opaque event data",
    "src.eregister.schemas.RegisterObservationCreate.body": "WMO observation body is format-specific opaque data",
    "src.eregister.schemas.RegisterObservationRead.body": "WMO observation body is format-specific opaque data",
    "src.eregister.schemas.RegisterObservationWrite.body": "WMO observation body is format-specific opaque data",
    "src.wxproducts.observations.ObservationRecord.payload": "observation payload preserves source-specific representations",
    "src.wxproducts.schemas.ForecastPeriod.details": "legacy forecast presentation map",
    "src.wxproducts.schemas.LegacyProductPdfSource.values": "frozen legacy product payload",
    "src.wxproducts.schemas.LegacyProductPreview.values": "frozen legacy product payload",
    "src.wxproducts.schemas.LegacyPublishedProduct.values": "frozen anonymous product payload",
    "src.wxproducts.schemas.LegacyStoredProduct.values": "frozen legacy product payload",
    "src.wxproducts.schemas.ProductPdfSourceBase[dict[str, str]].values": "frozen legacy product payload",
    "src.wxproducts.schemas.ProductPreviewBase[dict[str, str]].values": "frozen legacy product payload",
    "src.wxproducts.schemas.PublicPublishedProduct.values": "frozen anonymous product feed contract",
    "src.wxproducts.schemas.PublishedProductBase[dict[str, str]].values": "frozen legacy product payload",
    "src.wxproducts.schemas.StoredProductBase[dict[str, str]].values": "frozen legacy product payload",
}


def test_open_map_types_are_explicitly_exempted() -> None:
    offenders: list[str] = []
    for model in _all_subclasses(CustomModel):
        for name, field in model.model_fields.items():
            if get_origin(field.annotation) is not dict:
                continue
            args = get_args(field.annotation)
            if not args or (Any not in args and args != (str, str)):
                continue
            key = f"{model.__module__}.{model.__name__}.{name}"
            if key not in MAP_TYPE_EXEMPTIONS:
                offenders.append(key)
    assert not offenders, "Unapproved open map fields: " + ", ".join(sorted(offenders))


def test_wxproducts_typed_contract_has_discriminator() -> None:
    save = app.openapi()["paths"]["/api/v1/wxproducts/products"]["post"]
    preview = app.openapi()["paths"]["/api/v1/wxproducts/products/preview"]["post"]
    for operation in (save, preview):
        schema = operation["requestBody"]["content"]["application/json"]["schema"]
        assert schema["discriminator"]["propertyName"] == "kind"
        assert len(schema["oneOf"]) == 2

    preview_response = app.openapi()["paths"]["/api/v1/wxproducts/products/preview"][
        "post"
    ]["responses"]["200"]["content"]["application/json"]["schema"]
    assert preview_response["discriminator"]["propertyName"] == "kind"
