import json
import logging
import re
import time
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from typing import Any, cast

import sentry_sdk
from fastapi import FastAPI
from fastapi.openapi.utils import get_openapi
from fastapi.routing import APIRoute
from pydantic import ValidationError
from scalar_fastapi import get_scalar_api_reference
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import IntegrityError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request

from src.auth.browser import router as browser_auth_router
from src.auth.modern import router as modern_auth_router
from src.auth.routers.login import router as login_router
from src.auth.routers.permissions import router as permissions_router
from src.auth.routers.role_assignments import router as role_assignments_router
from src.auth.routers.roles import router as roles_router
from src.auth.routers.twofa import router as twofa_router
from src.auth.routers.users import router as users_router
from src.baseline.governance_router import router as governance_router
from src.baseline.router import router as staff_setup_router
from src.billing.router import router as billing_router
from src.cap.router import public_router as cap_public_router
from src.cap.router import router as cap_router
from src.config import settings
from src.eregister import database as eregister_database
from src.eregister.router import router as eregister_router
from src.exceptions import (
    AppException,
    app_exception_handler,
    integrity_error_handler,
    validation_exception_handler,
)
from src.hr.absentee.router import router as hr_absentee_router
from src.hr.calendar.router import router as hr_calendar_router
from src.hr.dailystatus.router import router as hr_dailystatus_router
from src.hr.dashboard.router import router as hr_dashboard_router
from src.hr.documents.router import router as hr_documents_router
from src.hr.exchange.router import router as hr_exchange_router
from src.hr.leave.router import router as hr_leave_router
from src.hr.parking.router import router as hr_parking_router
from src.hr.roster.router import router as hr_roster_router
from src.hr.routers.profile import router as hr_profile_router
from src.hr.signatures.router import router as hr_signatures_router
from src.hr.timesheet.router import router as hr_timesheet_router
from src.hr.training.router import router as hr_training_router
from src.hr.workflow.router import router as hr_workflow_router
from src.janitorial import database as janitorial_database
from src.janitorial.router import router as janitorial_router
from src.logging_config import configure_logging
from src.models import ValidationErrorResponse
from src.rate_limit import limiter

# from src.shipments.router import router as shipments_router
from src.storage.router import router as weather_images_router
from src.telemetry import sentry_options
from src.transport import database as transport_database
from src.transport.router import router as transport_router
from src.utils.router import router as utils_router
from src.webhooks.router import router as webhooks_router
from src.wxproducts import database as wxproducts_database
from src.wxproducts.router import router as wxproducts_router
from src.wxwatch import database as wxwatch_database
from src.wxwatch.ingestion import router as wxwatch_ingestion_router
from src.wxwatch.router import router as wxwatch_router

configure_logging()


def _camel_case(value: str) -> str:
    parts = [part for part in re.split(r"[^a-zA-Z0-9]+", value) if part]
    if not parts:
        return "operation"
    return parts[0].lower() + "".join(part.capitalize() for part in parts[1:])


def _operation_domain(route: APIRoute) -> str:
    path = route.path
    if path.startswith("/api/cap") or "/cap/" in path:
        return "cap"
    if "/auth/" in path or "/login" in path or "/2fa/" in path:
        return "auth"
    for domain in (
        "hr",
        "wxwatch",
        "wxproducts",
        "eregister",
        "billing",
        "utils",
        "janitorial",
        "transport",
    ):
        if f"/{domain}" in path:
            return domain
    tag = str((route.tags or ["api"])[0])
    if tag in {
        "login",
        "users",
        "roles",
        "permissions",
        "role-assignments",
        "2fa",
        "browser-auth",
        "modern-auth",
    }:
        return "auth"
    return _camel_case(tag.split("-")[0])


def custom_generate_unique_id(route: APIRoute) -> str:
    """Generate stable, readable operation IDs for generated clients."""
    name = route.name.removesuffix("_endpoint").removesuffix("_route")
    words = name.split("_")
    if words and words[0] == "read":
        words[0] = "get"
    operation = _camel_case("_".join(words))
    return f"{_operation_domain(route)}{operation[0].upper()}{operation[1:]}"


# Show docs only in selected envs (best practice: hide in production)
SHOW_DOCS_ENVIRONMENTS = ("local", "staging")

OPENAPI_TAGS = [
    {"name": "auth", "description": "Authentication, identity, and account security."},
    {"name": "billing", "description": "Billing and subscription operations."},
    {
        "name": "browser-auth",
        "description": "Browser session authentication operations.",
    },
    {"name": "cap", "description": "CAP authoring and hazard alert operations."},
    {"name": "cap-public", "description": "Public CAP alert feeds and formats."},
    {
        "name": "eregister",
        "description": "Electronic weather observation registration.",
    },
    {"name": "governance", "description": "Access governance and policy operations."},
    {"name": "hr", "description": "Human resources profile operations."},
    {"name": "hr-absentee", "description": "HR absentee reporting operations."},
    {"name": "hr-calendar", "description": "HR calendar operations."},
    {"name": "hr-dailystatus", "description": "HR daily status reporting operations."},
    {"name": "hr-dashboard", "description": "HR dashboard operations."},
    {"name": "hr-documents", "description": "HR document operations."},
    {"name": "hr-exchange", "description": "HR shift exchange operations."},
    {"name": "hr-leave", "description": "HR leave request operations."},
    {"name": "hr-parking", "description": "HR parking permit operations."},
    {"name": "hr-rosters", "description": "HR roster and scheduling operations."},
    {
        "name": "hr-signatures",
        "description": "HR signature and signed document operations.",
    },
    {"name": "hr-timesheets", "description": "HR timesheet operations."},
    {"name": "hr-training", "description": "HR training record operations."},
    {"name": "hr-workflows", "description": "HR workflow and approval operations."},
    {"name": "janitorial", "description": "Janitorial catalogue operations."},
    {"name": "login", "description": "Login, token, and password recovery operations."},
    {
        "name": "modern-auth",
        "description": "Modern authentication and recovery operations.",
    },
    {"name": "permissions", "description": "Permission administration operations."},
    {
        "name": "role-assignments",
        "description": "Role assignment administration operations.",
    },
    {"name": "roles", "description": "Role administration operations."},
    {"name": "staff-setup", "description": "Staff setup and configuration operations."},
    {"name": "transport", "description": "Transport timetable operations."},
    {"name": "users", "description": "User administration operations."},
    {"name": "utils", "description": "Health, readiness, and utility operations."},
    {"name": "weather-images", "description": "Weather image retrieval operations."},
    {"name": "wxproducts", "description": "Weather product authoring and publication."},
    {
        "name": "wxwatch",
        "description": "Weather archive, ingestion, and derivation operations.",
    },
]

# Sync SDKs: If you add a sync-only I/O library (e.g. sync HTTP/SMTP client), run its
# calls in a threadpool via fastapi.concurrency.run_in_threadpool to avoid blocking the event loop.


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncGenerator[None]:
    """Lifespan context manager for startup and shutdown (preferred over on_event)."""
    # Startup
    try:
        yield
    finally:
        await wxproducts_database.close_engine()
        await eregister_database.close_engine()
        await wxwatch_database.close_engine()
        await janitorial_database.close_engine()
        await transport_database.close_engine()


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(
        dsn=str(settings.SENTRY_DSN),
        environment=settings.ENVIRONMENT,
        **sentry_options(),
    )

# Configure app settings based on environment
app_configs: dict[str, Any] = {
    "title": settings.PROJECT_NAME,
    "version": "1.0.0",
    "generate_unique_id_function": custom_generate_unique_id,
    "description": (
        "Grenmet API for authenticated administration, human resources, "
        "weather products, CAP alerts, and observation registration."
    ),
    "contact": {"name": "Grenmet API maintainers"},
    "license_info": {"name": "Proprietary"},
    "openapi_tags": OPENAPI_TAGS,
}
if settings.ENVIRONMENT in SHOW_DOCS_ENVIRONMENTS:
    app_configs["openapi_url"] = f"{settings.API_V1_STR}/openapi.json"
    app_configs["docs_url"] = "/swagger"
    app_configs["redoc_url"] = "/redoc"
else:
    app_configs["openapi_url"] = None
    app_configs["docs_url"] = None
    app_configs["redoc_url"] = None

openapi_url: str | None = cast(str | None, app_configs.get("openapi_url"))
docs_url: str | None = cast(str | None, app_configs.get("docs_url"))
redoc_url: str | None = cast(str | None, app_configs.get("redoc_url"))
server_url = str(
    settings.API_BASE_URL
    or {
        "local": "http://localhost:8000",
        "staging": "https://api.staging.barrels.gd",
        "production": "https://api.barrels.gd",
    }[settings.ENVIRONMENT]
)

app = FastAPI(
    title=str(app_configs.get("title", "")),
    description=str(app_configs.get("description", "")),
    version=str(app_configs.get("version", "")),
    contact=cast(dict[str, Any], app_configs["contact"]),
    license_info=cast(dict[str, Any], app_configs["license_info"]),
    servers=[{"url": server_url}],
    openapi_tags=cast(list[dict[str, str]], app_configs["openapi_tags"]),
    generate_unique_id_function=custom_generate_unique_id,
    responses={422: {"model": ValidationErrorResponse}},
    openapi_url=openapi_url,
    docs_url=docs_url,
    redoc_url=redoc_url,
    lifespan=lifespan,
)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, cast(Any, _rate_limit_exceeded_handler))

# Request logging wraps the CORS middleware, so rejected preflights are visible.
logger = logging.getLogger("src.request")


async def request_logging_middleware(request: Request, call_next: Any) -> Any:
    start = time.perf_counter()
    response = await call_next(request)
    duration_s = time.perf_counter() - start
    logger.info(
        "%s %s %s %.3fs origin=%s cors_allow_origin=%s requested_headers=%s",
        request.method,
        request.url.path,
        response.status_code,
        duration_s,
        request.headers.get("origin", "-"),
        response.headers.get("access-control-allow-origin", "-"),
        request.headers.get("access-control-request-headers", "-"),
    )
    return response


# Set all CORS enabled origins
if settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        # Browser clients and observability integrations may add headers beyond
        # the authentication and content headers used by the API itself.
        allow_headers=["Authorization", "Content-Type"],
    )
app.add_middleware(BaseHTTPMiddleware, dispatch=request_logging_middleware)
# Include routers
# app.include_router(shipments_router, prefix="/api/v1")
# Auth-related routers (split for better organization)
app.include_router(login_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(twofa_router, prefix="/api/v1")
app.include_router(roles_router, prefix="/api/v1")
app.include_router(permissions_router, prefix="/api/v1")
app.include_router(role_assignments_router, prefix="/api/v1")
app.include_router(billing_router, prefix="/api/v1")
app.include_router(hr_profile_router, prefix="/api/v1")
app.include_router(hr_workflow_router, prefix="/api/v1")
app.include_router(hr_roster_router, prefix="/api/v1")
app.include_router(hr_calendar_router, prefix="/api/v1")
app.include_router(hr_timesheet_router, prefix="/api/v1")
app.include_router(hr_training_router, prefix="/api/v1")
app.include_router(hr_signatures_router, prefix="/api/v1")
app.include_router(hr_leave_router, prefix="/api/v1")
app.include_router(hr_absentee_router, prefix="/api/v1")
app.include_router(hr_exchange_router, prefix="/api/v1")
app.include_router(hr_dailystatus_router, prefix="/api/v1")
app.include_router(hr_parking_router, prefix="/api/v1")
app.include_router(hr_documents_router, prefix="/api/v1")
app.include_router(cap_router, prefix="/api/v1")
app.include_router(cap_public_router)

# Other routers
app.include_router(utils_router, prefix="/api/v1")
app.include_router(weather_images_router, prefix="/api/v1")
app.include_router(webhooks_router, prefix="/api/v1")
app.include_router(wxproducts_router, prefix=settings.API_V1_STR)
app.include_router(eregister_router, prefix=settings.API_V1_STR)
app.include_router(wxwatch_router, prefix=settings.API_V1_STR)
app.include_router(wxwatch_ingestion_router, prefix=settings.API_V1_STR)
app.include_router(browser_auth_router, prefix=settings.API_V1_STR)
app.include_router(janitorial_router, prefix=settings.API_V1_STR)
app.include_router(transport_router, prefix=settings.API_V1_STR)

# Register exception handlers
app.add_exception_handler(AppException, app_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(ValidationError, validation_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(IntegrityError, integrity_error_handler)  # type: ignore[arg-type]

# Include private router for local development
if settings.ENVIRONMENT == "local":
    try:
        from src.private.router import (  # type: ignore[import-untyped]
            router as private_router,
        )

        app.include_router(private_router, prefix="/api/v1")
    except ImportError:
        # Private module is optional
        pass


@app.get("/scalar", include_in_schema=False)
def get_scalar_docs() -> Any:
    return get_scalar_api_reference(
        openapi_url=openapi_url,
        title=settings.PROJECT_NAME,
    )


app.include_router(modern_auth_router, prefix=settings.API_V1_STR)

app.include_router(staff_setup_router, prefix=settings.API_V1_STR)


app.include_router(hr_dashboard_router, prefix=settings.API_V1_STR)


app.include_router(governance_router, prefix=settings.API_V1_STR)


def _lift_inline_enums(schema: dict[str, Any]) -> None:
    """Promote inline enum properties to reusable OpenAPI components."""
    components = schema.setdefault("components", {}).setdefault("schemas", {})
    known: dict[str, str] = {}

    def pascal(value: str) -> str:
        separated = re.sub(r"([a-z0-9])([A-Z])", r"\1 \2", value)
        return "".join(
            part.capitalize() for part in re.split(r"[^a-zA-Z0-9]+", separated) if part
        )

    def walk(node: Any, context: str, check_self: bool = True) -> Any:
        if isinstance(node, list):
            return [walk(value, context, True) for value in node]
        if not isinstance(node, dict):
            return node
        if check_self and "enum" in node and "$ref" not in node:
            signature = json.dumps(
                {"type": node.get("type", "string"), "enum": node["enum"]},
                sort_keys=True,
            )
            name = known.get(signature)
            if name is None:
                name = f"{pascal(context)}Enum" or "InlineEnum"
                base = name
                suffix = 2
                while name in components and components[name] != node:
                    name = f"{base}{suffix}"
                    suffix += 1
                known[signature] = name
                components[name] = {
                    key: value for key, value in node.items() if key != "title"
                }
            return {"$ref": f"#/components/schemas/{name}"}
        return {
            key: walk(value, f"{context}{pascal(key)}", True)
            for key, value in node.items()
        }

    for name, model in list(components.items()):
        components[name] = walk(model, name, False)
    for path, path_item in schema.get("paths", {}).items():
        for method, operation in path_item.items():
            if not isinstance(operation, dict) or method == "parameters":
                continue
            context = operation.get("operationId") or f"{method}{path}"
            path_item[method] = walk(operation, pascal(context), True)


def _custom_openapi() -> dict[str, Any]:
    if app.openapi_schema:
        return app.openapi_schema
    schema = get_openapi(
        title=app.title,
        version=app.version,
        openapi_version=app.openapi_version,
        description=app.description,
        routes=app.routes,
        tags=OPENAPI_TAGS,
        servers=app.servers,
        terms_of_service=app.terms_of_service,
        contact=app.contact,
        license_info=app.license_info,
    )
    _lift_inline_enums(schema)
    app.openapi_schema = schema
    return schema


app.openapi = _custom_openapi  # type: ignore[method-assign]
