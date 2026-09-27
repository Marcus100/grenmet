"""Contract-level invariants for FastAPI, Kubb, and AI consumers."""

import re
from collections.abc import Iterator
from typing import Any

from fastapi import APIRouter, FastAPI
from fastapi.routing import APIRoute, iter_route_contexts

from src.main import app


def _operations() -> Iterator[tuple[str, str, dict[str, Any]]]:
    methods = {"get", "post", "put", "patch", "delete", "options", "head", "trace"}
    for path, path_item in app.openapi()["paths"].items():
        for method, operation in path_item.items():
            if method in methods and isinstance(operation, dict):
                yield path, method, operation


def _has_success_response(operation: dict[str, Any]) -> bool:
    responses = operation.get("responses", {})
    if any(status.startswith("3") for status in responses):
        return True
    for status, response in responses.items():
        if not status.startswith("2"):
            continue
        if status == "204":
            return True
        for media_type, media in response.get("content", {}).items():
            if media_type != "application/json":
                return True
            if media.get("schema"):
                return True
    return False


def _inline_enums(value: Any, location: str = "") -> Iterator[str]:
    if isinstance(value, dict):
        if (
            "enum" in value
            and "$ref" not in value
            and ("/properties/" in location or "/parameters" in location)
        ):
            yield location
        for key, child in value.items():
            yield from _inline_enums(child, f"{location}/{key}")
    elif isinstance(value, list):
        for index, child in enumerate(value):
            yield from _inline_enums(child, f"{location}[{index}]")


def test_openapi_document_metadata_is_complete() -> None:
    document = app.openapi()
    assert document["info"]["description"]
    assert document["info"]["contact"]
    assert document["info"]["license"]
    assert document["servers"]
    assert document["tags"]
    assert all(tag.get("description") for tag in document["tags"])


def test_operation_ids_are_unique_and_client_safe() -> None:
    operations = list(_operations())
    operation_ids = [operation["operationId"] for _, _, operation in operations]
    assert len(operation_ids) == len(set(operation_ids))
    assert all(
        re.fullmatch(r"[a-z][A-Za-z0-9]+", operation_id)
        for operation_id in operation_ids
    )
    assert all("_api_v1_" not in operation_id for operation_id in operation_ids)


def test_operations_are_described_and_have_success_responses() -> None:
    offenders = []
    for path, method, operation in _operations():
        description = operation.get("description") or ""
        if not description:
            offenders.append(f"{method.upper()} {path}: description")
        if "HTTP " in description and " operation at " in description:
            offenders.append(f"{method.upper()} {path}: synthetic description")
        if not _has_success_response(operation):
            offenders.append(f"{method.upper()} {path}: success response")
    assert not offenders, "OpenAPI operations missing contract metadata: " + ", ".join(
        offenders
    )


def test_openapi_has_no_anonymous_enums() -> None:
    offenders = list(
        _inline_enums(
            app.openapi().get("components", {}).get("schemas", {}), "components"
        )
    )
    assert not offenders, "Anonymous OpenAPI enums: " + ", ".join(offenders)


def _missing_response_models(application: FastAPI) -> list[str]:
    raw_response_exemptions = {
        # File/image downloads and XML feeds deliberately return Response objects.
        "download_document",
        "download_signed_document",
        "weather_image",
        "archive_asset",
        "get_scalar_docs",
        "read_rss",
        "read_cap_xml",
        "preview_product_pdf",
        "product_revision_pdf",
    }
    offenders = [
        route.name
        for route in iter_route_contexts(application.routes)
        if isinstance(route.original_route, APIRoute)
        and route.include_in_schema
        and route.status_code != 204
        and route.response_model is None
        and route.name not in raw_response_exemptions
    ]
    return offenders


def test_model_guard_checks_nested_included_routers() -> None:
    application = FastAPI()
    parent = APIRouter()
    child = APIRouter()

    @child.get("/untyped", response_model=None)
    def untyped() -> dict[str, str]:
        return {"message": "unvalidated"}

    parent.include_router(child, prefix="/child")
    application.include_router(parent, prefix="/parent")
    assert _missing_response_models(application) == ["untyped"]


def test_api_schema_routes_use_explicit_models_or_documented_raw_responses() -> None:
    offenders = _missing_response_models(app)
    assert not offenders, "Routes missing response_model: " + ", ".join(offenders)


def test_model_guard_respects_schema_visibility_and_no_content() -> None:
    application = FastAPI()
    hidden = APIRouter()

    @hidden.get("/hidden", response_model=None)
    def hidden_endpoint() -> dict[str, str]:
        return {}

    application.include_router(hidden, include_in_schema=False)

    @application.delete("/empty", status_code=204)
    def empty() -> None:
        return None

    @application.get("/typed")
    def typed() -> dict[str, str]:
        return {"message": "validated"}

    assert _missing_response_models(application) == []


def test_model_guard_visits_every_openapi_operation() -> None:
    visited = {
        (route.path_format, method.lower())
        for route in iter_route_contexts(app.routes)
        if isinstance(route.original_route, APIRoute) and route.include_in_schema
        for method in route.methods or set()
    }
    assert visited
    assert visited == {(path, method) for path, method, _ in _operations()}
