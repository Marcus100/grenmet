import logging
import time
from contextlib import asynccontextmanager
from typing import Any, cast

import sentry_sdk
from fastapi import FastAPI
from fastapi.routing import APIRoute
from pydantic import ValidationError
from scalar_fastapi import get_scalar_api_reference
from sqlalchemy.exc import IntegrityError
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.cors import CORSMiddleware
from starlette.requests import Request

from src.auth.routers.login import router as login_router
from src.auth.routers.permissions import router as permissions_router
from src.auth.routers.role_assignments import router as role_assignments_router
from src.auth.routers.roles import router as roles_router
from src.auth.routers.users import router as users_router
from src.config import settings
from src.exceptions import (
    AppException,
    app_exception_handler,
    integrity_error_handler,
    validation_exception_handler,
)
from src.hr.absentee.router import router as hr_absentee_router
from src.hr.dailystatus.router import router as hr_dailystatus_router
from src.hr.exchange.router import router as hr_exchange_router
from src.hr.leave.router import router as hr_leave_router
from src.hr.roster.router import router as hr_roster_router
from src.hr.routers.profile import router as hr_profile_router
from src.hr.timesheet.router import router as hr_timesheet_router
from src.hr.workflow.router import router as hr_workflow_router

# from src.shipments.router import router as shipments_router
from src.utils.router import router as utils_router


def custom_generate_unique_id(route: APIRoute) -> str:
    return f"{route.tags[0]}-{route.name}"


# Show docs only in selected envs (best practice: hide in production)
SHOW_DOCS_ENVIRONMENTS = ("local", "staging")


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Lifespan context manager for startup and shutdown (preferred over on_event)."""
    # Startup
    yield
    # Shutdown (e.g. close pools, flush logs)


if settings.SENTRY_DSN and settings.ENVIRONMENT != "local":
    sentry_sdk.init(dsn=str(settings.SENTRY_DSN), enable_tracing=True)

# Configure app settings based on environment
app_configs: dict[str, Any] = {
    "title": settings.PROJECT_NAME,
    "version": "1.0.0",
    "generate_unique_id_function": custom_generate_unique_id,
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

app = FastAPI(
    title=str(app_configs.get("title", "")),
    description=str(app_configs.get("description", "")),
    version=str(app_configs.get("version", "")),
    openapi_url=openapi_url,
    docs_url=docs_url,
    redoc_url=redoc_url,
    lifespan=lifespan,
)

# Request logging middleware (runs after CORS; logs method, path, status, duration)
logger = logging.getLogger("src.request")


async def request_logging_middleware(request: Request, call_next: Any) -> Any:
    start = time.perf_counter()
    response = await call_next(request)
    duration_s = time.perf_counter() - start
    logger.info(
        "%s %s %s %.3fs",
        request.method,
        request.url.path,
        response.status_code,
        duration_s,
    )
    return response

# Set all CORS enabled origins
if settings.all_cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.all_cors_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )
app.add_middleware(BaseHTTPMiddleware, dispatch=request_logging_middleware)
# Include routers
# app.include_router(shipments_router, prefix="/api/v1")
# Auth-related routers (split for better organization)
app.include_router(login_router, prefix="/api/v1")
app.include_router(users_router, prefix="/api/v1")
app.include_router(roles_router, prefix="/api/v1")
app.include_router(permissions_router, prefix="/api/v1")
app.include_router(role_assignments_router, prefix="/api/v1")
app.include_router(hr_profile_router, prefix="/api/v1")
app.include_router(hr_workflow_router, prefix="/api/v1")
app.include_router(hr_roster_router, prefix="/api/v1")
app.include_router(hr_timesheet_router, prefix="/api/v1")
app.include_router(hr_leave_router, prefix="/api/v1")
app.include_router(hr_absentee_router, prefix="/api/v1")
app.include_router(hr_exchange_router, prefix="/api/v1")
app.include_router(hr_dailystatus_router, prefix="/api/v1")

# Other routers

app.include_router(utils_router, prefix="/api/v1")

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
