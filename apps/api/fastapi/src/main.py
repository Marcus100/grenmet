import json
import logging
import re
import time
from collections.abc import AsyncGenerator, Awaitable, Callable
from contextlib import asynccontextmanager
from typing import Any, cast

import sentry_sdk
from fastapi import APIRouter, FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.openapi.utils import get_openapi
from fastapi.responses import JSONResponse, Response
from fastapi.routing import APIRoute
from pydantic import ValidationError
from scalar_fastapi import get_scalar_api_reference
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy.exc import IntegrityError
from starlette.datastructures import Headers, MutableHeaders
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from src import database as main_database
from src import operational_metrics
from src.almanac.router import router as almanac_router
from src.audit.router import router as audit_router
from src.auth.app_router import account_router as account_apps_router
from src.auth.app_router import router as app_auth_router
from src.auth.browser import router as browser_auth_router
from src.auth.lockout import rate_limit_store_warning
from src.auth.modern import router as modern_auth_router
from src.auth.onboarding_router import router as onboarding_router
from src.auth.routers.login import router as login_router
from src.auth.routers.permissions import router as permissions_router
from src.auth.routers.role_assignments import router as role_assignments_router
from src.auth.routers.roles import router as roles_router
from src.auth.routers.twofa import router as twofa_router
from src.auth.routers.users import router as users_router
from src.baseline.governance_router import router as governance_router
from src.baseline.router import router as staff_setup_router
from src.billing.invoice_router import router as billing_invoice_router
from src.billing.router import router as billing_router
from src.bookings.router import router as bookings_router
from src.bookings.settings import router as bookings_settings_router
from src.cap.router import public_router as cap_public_router
from src.cap.router import router as cap_router
from src.config import settings
from src.contact.router import router as contact_router
from src.contacts.router import router as contacts_router
from src.content_distribution.router import router as content_distribution_router
from src.domain_manifest import Mount
from src.domains import ordered_mounts
from src.environmental.router import router as environmental_router
from src.eregister import database as eregister_database
from src.eregister.iwxxm import preload_schema_in_background
from src.eregister.router import router as eregister_router
from src.events.moderation_router import router as events_moderation_router
from src.events.org_router import router as events_org_router
from src.events.router import router as events_router
from src.events.staff_router import router as events_staff_router
from src.exceptions import (
    AppException,
    app_exception_handler,
    integrity_error_handler,
    request_validation_exception_handler,
    validation_exception_handler,
)
from src.feature_flags.router import router as feature_flags_router
from src.feedback.router import router as feedback_router
from src.flights.router import router as flights_router
from src.hr.absentee.router import router as hr_absentee_router
from src.hr.attendance.clock_router import router as hr_clock_router
from src.hr.attendance.router import router as hr_attendance_router
from src.hr.calendar.router import router as hr_calendar_router
from src.hr.dailystatus.router import router as hr_dailystatus_router
from src.hr.dashboard.router import router as hr_dashboard_router
from src.hr.documents.router import router as hr_documents_router
from src.hr.exchange.router import router as hr_exchange_router
from src.hr.leave.router import router as hr_leave_router
from src.hr.parking.router import router as hr_parking_router
from src.hr.payroll.router import router as hr_payroll_router
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
from src.models_guidance.router import router as models_guidance_router
from src.notifications.router import router as notifications_router
from src.organisations.dependencies import ORGANISATION_HEADER
from src.organisations.router import router as organisations_router
from src.payments.router import router as payments_router
from src.push.router import router as push_router
from src.rate_limit import limiter
from src.request_context import (
    REQUEST_ID_HEADER,
    bind_request_id,
    reset_request_id,
    resolve_request_id,
)
from src.rewards.router import router as rewards_router
from src.storage.router import router as weather_images_router
from src.storage.uploads_router import router as uploads_router
from src.stores.router import router as stores_router
from src.subscriptions.router import router as subscriptions_router
from src.telemetry import sentry_options
from src.transport import database as transport_database
from src.transport.router import router as transport_router
from src.utils.router import router as utils_router
from src.webhooks.router import router as webhooks_router
from src.wxproducts import database as wxproducts_database
from src.wxproducts.router import router as wxproducts_router
from src.wxwatch import database as wxwatch_database
from src.wxwatch.ingestion import router as wxwatch_ingestion_router
from src.wxwatch.nhc_router import router as nhc_router
from src.wxwatch.public_router import router as wxwatch_public_router
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
    if "/auth/" in path:
        return "auth"
    for domain in (
        "hr",
        "wxwatch",
        "wxproducts",
        "eregister",
        "billing",
        "rewards",
        "bookings",
        "utils",
        "janitorial",
        "transport",
        "events",
        "stores",
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
    {"name": "audit", "description": "Record change history."},
    {
        "name": "feature-flags",
        "description": "Feature flags with success metrics and audience rules.",
    },
    {"name": "auth", "description": "Authentication, identity, and account security."},
    {"name": "billing", "description": "Billing and subscription operations."},
    {
        "name": "bookings",
        "description": "Barrels Bookings: services, availability and appointments.",
    },
    {
        "name": "rewards",
        "description": "Barrels ID rewards: stamp cards, trust badges, redemption.",
    },
    {
        "name": "payments",
        "description": "Barrels Payments: intents, callbacks, refunds and the ledger.",
    },
    {
        "name": "browser-auth",
        "description": "Browser session authentication operations.",
    },
    {"name": "cap", "description": "CAP authoring and hazard alert operations."},
    {"name": "cap-public", "description": "Public CAP alert feeds and formats."},
    {
        "name": "environment",
        "description": "Public marine, UV and dust forecasts (Copernicus; not a GMS product).",
    },
    {
        "name": "models-guidance",
        "description": (
            "Raw ECMWF and NOAA model point guidance for the GMS Dashboard "
            "(not an official GMS forecast)."
        ),
    },
    {
        "name": "flights",
        "description": "Public recent flight movements (OpenSky, research use).",
    },
    {
        "name": "contact",
        "description": "Public website contact forms (no sign-in).",
    },
    {
        "name": "feedback",
        "description": "Anonymous 'Was this page helpful?' answers (no sign-in).",
    },
    {
        "name": "subscriptions",
        "description": "Public mailing-list sign-up with double opt-in (no sign-in).",
    },
    {
        "name": "content-distribution",
        "description": "Social posts saved by the CMS (shared-secret hook) and their per-platform status for staff. Dry run only.",
    },
    {
        "name": "push",
        "description": "Browser push subscriptions for public alerts (no sign-in).",
    },
    {
        "name": "eregister",
        "description": "Electronic weather observation registration.",
    },
    {"name": "governance", "description": "Access governance and policy operations."},
    {"name": "hr", "description": "Human resources profile operations."},
    {"name": "hr-absentee", "description": "HR absentee reporting operations."},
    {
        "name": "hr-attendance",
        "description": "Actual shift arrival, departure and supervisor review.",
    },
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
    {
        "name": "stores",
        "description": "Internal stores catalogue, stock and requisitions.",
    },
    {"name": "login", "description": "Login, token, and password recovery operations."},
    {
        "name": "modern-auth",
        "description": "Modern authentication and recovery operations.",
    },
    {
        "name": "notifications",
        "description": "In-app notifications, email preferences and settings.",
    },
    {
        "name": "contacts",
        "description": "An organisation's contact book: people, consent and erasure.",
    },
    {
        "name": "organisations",
        "description": "Platform organisations and the caller's memberships.",
    },
    {
        "name": "webhooks-out",
        "description": "Signed outbound webhooks for organisations.",
    },
    {"name": "permissions", "description": "Permission administration operations."},
    {
        "name": "role-assignments",
        "description": "Role assignment administration operations.",
    },
    {"name": "roles", "description": "Role administration operations."},
    {"name": "staff-setup", "description": "Staff setup and configuration operations."},
    {"name": "transport", "description": "Transport timetable operations."},
    {
        "name": "events",
        "description": "Barrels Events: listings, groups, members and messaging.",
    },
    {"name": "users", "description": "User administration operations."},
    {"name": "utils", "description": "Health, readiness, and utility operations."},
    {"name": "weather-images", "description": "Weather image retrieval operations."},
    {
        "name": "storage",
        "description": "Organisation-scoped uploads and file reads.",
    },
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
    store_warning = rate_limit_store_warning()
    if store_warning:
        logging.getLogger(__name__).warning(store_warning)
    # The IWXXM schema loads in the background (about 8 s), so the first accept does not wait.
    preload_schema_in_background()
    try:
        yield
    finally:
        # Return every pooled connection to Postgres on shutdown or redeploy;
        # one engine failing to close is logged and never stops the others.
        closers: list[tuple[str, Callable[[], Awaitable[None]]]] = [
            ("wxproducts", wxproducts_database.close_engine),
            ("eregister", eregister_database.close_engine),
            ("wxwatch", wxwatch_database.close_engine),
            ("janitorial", janitorial_database.close_engine),
            ("transport", transport_database.close_engine),
            ("main", main_database.async_engine.dispose),
        ]
        for name, close in closers:
            try:
                await close()
            except Exception:
                logging.getLogger(__name__).exception(
                    "database engine %s failed to close", name
                )


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
        "The Barrels Grenada API for authenticated administration, human resources, "
        "weather products, CAP alerts, and observation registration."
    ),
    "contact": {"name": "Barrels Grenada maintainers"},
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


class RequestLoggingMiddleware:
    """Pure ASGI request logging: request ID, one log line and request metrics.

    Plain ASGI instead of ``BaseHTTPMiddleware`` keeps streamed responses
    unbuffered and runs the endpoint in the same context as the bound ID.
    """

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        start = time.perf_counter()
        status = 500
        request_id = resolve_request_id(Headers(scope=scope).get(REQUEST_ID_HEADER))
        # Request.state reads scope["state"]; the 500 handler looks the ID up there.
        scope.setdefault("state", {})["request_id"] = request_id
        token = bind_request_id(request_id)
        sentry_sdk.set_tag("request_id", request_id)

        async def send_with_request_id(message: Message) -> None:
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                # ASGI makes "headers" optional on the start message.
                message.setdefault("headers", [])
                MutableHeaders(scope=message)[REQUEST_ID_HEADER] = request_id
            await send(message)

        try:
            await self.app(scope, receive, send_with_request_id)
        finally:
            try:
                duration_s = time.perf_counter() - start
                route = getattr(scope.get("route"), "path", "unmatched")
                logger.info(
                    "request route=%s status=%s duration=%.3fs request_id=%s",
                    route,
                    status,
                    duration_s,
                    request_id,
                )
                await operational_metrics.record_request(route, status, duration_s)
            finally:
                reset_request_id(token)


async def unhandled_exception_handler(request: Request, _exc: Exception) -> Response:
    # Runs in ServerErrorMiddleware, outside the logging middleware, so the
    # header is added here; Starlette re-raises afterwards so Sentry still sees it.
    request_id = getattr(request.state, "request_id", None)
    headers = {REQUEST_ID_HEADER: request_id} if request_id else {}
    return JSONResponse(
        {"detail": "Internal Server Error"}, status_code=500, headers=headers
    )


app.add_exception_handler(Exception, unhandled_exception_handler)

# Set all CORS enabled origins
if settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        # Browser clients and observability integrations may add headers beyond
        # the authentication and content headers used by the API itself.
        allow_headers=["Authorization", "Content-Type", ORGANISATION_HEADER],
        expose_headers=[REQUEST_ID_HEADER],
    )
app.add_middleware(RequestLoggingMiddleware)


def _legacy(key: str, router: APIRouter, *, versioned: bool = True) -> Mount:
    return Mount(key, router, versioned)


# Routers not yet moved to a domain manifest (ADR-0031), by MOUNT_ORDER key.
_LEGACY_MOUNTS: dict[str, Mount] = {
    mount.key: mount
    for mount in (
        _legacy("auth.login", login_router),
        _legacy("auth.users", users_router),
        _legacy("auth.twofa", twofa_router),
        _legacy("auth.roles", roles_router),
        _legacy("auth.permissions", permissions_router),
        _legacy("auth.role_assignments", role_assignments_router),
        _legacy("billing.billing", billing_router),
        _legacy("billing.invoices", billing_invoice_router),
        _legacy("rewards.rewards", rewards_router),
        _legacy("payments.payments", payments_router),
        _legacy("bookings.bookings", bookings_router),
        _legacy("bookings.settings", bookings_settings_router),
        _legacy("hr.profile", hr_profile_router),
        _legacy("hr.workflow", hr_workflow_router),
        _legacy("hr.roster", hr_roster_router),
        _legacy("hr.calendar", hr_calendar_router),
        _legacy("hr.timesheet", hr_timesheet_router),
        _legacy("hr.clock", hr_clock_router),
        _legacy("hr.attendance", hr_attendance_router),
        _legacy("hr.payroll", hr_payroll_router),
        _legacy("hr.training", hr_training_router),
        _legacy("hr.signatures", hr_signatures_router),
        _legacy("hr.leave", hr_leave_router),
        _legacy("hr.absentee", hr_absentee_router),
        _legacy("hr.exchange", hr_exchange_router),
        _legacy("hr.dailystatus", hr_dailystatus_router),
        _legacy("hr.parking", hr_parking_router),
        _legacy("hr.documents", hr_documents_router),
        _legacy("audit.audit", audit_router),
        _legacy("stores.stores", stores_router),
        _legacy("notifications.notifications", notifications_router),
        _legacy("organisations.organisations", organisations_router),
        _legacy("feature_flags.feature_flags", feature_flags_router),
        _legacy("contacts.contacts", contacts_router),
        _legacy("cap.cap", cap_router),
        _legacy("cap.public", cap_public_router, versioned=False),
        _legacy("utils.utils", utils_router),
        _legacy("storage.weather_images", weather_images_router),
        _legacy("storage.uploads", uploads_router),
        _legacy("webhooks.webhooks", webhooks_router),
        _legacy("subscriptions.subscriptions", subscriptions_router),
        _legacy("push.push", push_router),
        _legacy("contact.contact", contact_router),
        _legacy("feedback.feedback", feedback_router),
        _legacy(
            "content_distribution.content_distribution", content_distribution_router
        ),
        _legacy("flights.flights", flights_router),
        _legacy("environmental.environmental", environmental_router),
        _legacy("almanac.almanac", almanac_router),
        _legacy("models_guidance.models_guidance", models_guidance_router),
        _legacy("wxproducts.wxproducts", wxproducts_router),
        _legacy("eregister.eregister", eregister_router),
        _legacy("wxwatch.wxwatch", wxwatch_router),
        _legacy("wxwatch.public", wxwatch_public_router),
        _legacy("wxwatch.nhc", nhc_router),
        _legacy("wxwatch.ingestion", wxwatch_ingestion_router),
        _legacy("auth.browser", browser_auth_router),
        _legacy("janitorial.janitorial", janitorial_router),
        _legacy("transport.transport", transport_router),
        _legacy("events.events", events_router),
        _legacy("events.moderation", events_moderation_router),
        _legacy("events.org", events_org_router),
        _legacy("events.staff", events_staff_router),
        _legacy("auth.onboarding", onboarding_router),
        _legacy("auth.modern", modern_auth_router),
        _legacy("auth.app", app_auth_router),
        _legacy("auth.account_apps", account_apps_router),
        _legacy("baseline.staff_setup", staff_setup_router),
        _legacy("hr.dashboard", hr_dashboard_router),
        _legacy("baseline.governance", governance_router),
    )
}


def _mount_routers() -> None:
    for mount in ordered_mounts(_LEGACY_MOUNTS):
        if mount.versioned:
            app.include_router(mount.router, prefix=settings.API_V1_STR)
        else:
            app.include_router(mount.router)


_mount_routers()


# Register exception handlers
app.add_exception_handler(AppException, app_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(ValidationError, validation_exception_handler)  # type: ignore[arg-type]
app.add_exception_handler(RequestValidationError, request_validation_exception_handler)
app.add_exception_handler(IntegrityError, integrity_error_handler)  # type: ignore[arg-type]

# Include private router for local development. It mounts after every
# MOUNT_ORDER router, so a path it shares with one of them loses (ADR-0031).
if settings.ENVIRONMENT == "local":
    try:
        from src.private.router import (  # type: ignore[import-untyped]
            router as private_router,
        )

        app.include_router(private_router, prefix=settings.API_V1_STR)
    except ImportError:
        # Private module is optional
        pass


@app.get("/scalar", include_in_schema=False)
def get_scalar_docs() -> Any:
    return get_scalar_api_reference(
        openapi_url=openapi_url,
        title=settings.PROJECT_NAME,
    )


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
