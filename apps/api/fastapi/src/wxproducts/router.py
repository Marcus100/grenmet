import logging
from datetime import UTC, date, datetime
from typing import Annotated, get_args
from uuid import UUID

from fastapi import APIRouter, Query, Response, status
from fastapi.responses import JSONResponse
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool

from . import forecast, pdf, service, validation
from .dependencies import AuthorDep, AuthoringSessionDep, WxProductsSessionDep
from .exceptions import WeatherUnavailable
from .models import AviationDraft
from .observation_service import list_observations
from .observations import ObservationKind, ObservationList
from .schemas import (
    AuthoredProducts,
    AuthoringError,
    AviationDraftList,
    AviationDraftRead,
    AviationDraftWrite,
    AviationHistory,
    AviationKind,
    AviationRevisionRead,
    ProductFeedError,
    ProductHistory,
    ProductHistoryEntry,
    ProductKind,
    ProductPreview,
    ProductPreviewInput,
    ProductWrite,
    PublicForecast,
    PublicPublishedProduct,
    PublishedProducts,
    StoredProduct,
    StoredProductAdapter,
)

router = APIRouter()
logger = logging.getLogger(__name__)
NO_STORE = {"Cache-Control": "no-store"}


@router.get(
    "/wxproducts/observations",
    response_model=ObservationList,
    summary="List time-aligned meteorological observations",
    description=(
        "Read-only compatibility view for SYNOP, METAR and SPECI. "
        "Original payloads and representation provenance are preserved."
    ),
    tags=["wxproducts"],
    responses={401: {"model": AuthoringError}, 403: {"model": AuthoringError}},
)
async def load_observations(
    *,
    _author: AuthorDep,
    session: AuthoringSessionDep,
    response: Response,
    kind: ObservationKind,
    station: Annotated[str | None, Query(min_length=1, max_length=32)] = None,
    start: datetime | None = None,
    end: datetime | None = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> ObservationList:
    response.headers.update(NO_STORE)
    # AuthorDep authenticates staff access; observation ownership remains in SURFACE.
    rows = await list_observations(
        session, kind=kind, station=station, start=start, end=end, limit=limit
    )
    return ObservationList(observations=rows)


@router.get(
    "/wxproducts/public/products",
    response_model=PublishedProducts,
    status_code=status.HTTP_200_OK,
    summary="List current published weather products",
    description="Anonymous feed of published snapshots, excluding drafts and expired products.",
    tags=["wxproducts"],
    responses={400: {"model": ProductFeedError}, 503: {"model": ProductFeedError}},
)
async def list_public_products(
    *, session: WxProductsSessionDep, response: Response, kind: str | None = None
) -> PublishedProducts | JSONResponse:
    response.headers.update(NO_STORE)
    if kind and kind not in get_args(ProductKind):
        return JSONResponse(
            {"error": "Unknown product type"}, status_code=400, headers=NO_STORE
        )
    if session is not None:
        try:
            selected = TypeAdapter(ProductKind).validate_python(kind) if kind else None
            products = await service.list_published_products(session, selected)
            return PublishedProducts(
                products=[
                    PublicPublishedProduct.model_validate(
                        product.model_dump(mode="json", exclude_none=True)
                    )
                    for product in products
                ]
            )
        except (SQLAlchemyError, OSError, TimeoutError, ValidationError):
            logger.warning("Weather product feed unavailable")
    return JSONResponse(
        {"error": "Product information is unavailable"},
        status_code=503,
        headers=NO_STORE,
    )


@router.get(
    "/wxproducts/products",
    response_model=AuthoredProducts,
    status_code=200,
    summary="Load saved weather products",
    description="Load drafts for an authorized product kind and issue date, including undated drafts.",
    tags=["wxproducts"],
    responses={
        401: {"model": AuthoringError, "description": "Sign-in required"},
        403: {"model": AuthoringError, "description": "Product access denied"},
        503: {"model": AuthoringError, "description": "Weather database unavailable"},
    },
)
async def load_products(
    *,
    author: AuthorDep,
    session: AuthoringSessionDep,
    response: Response,
    kind: ProductKind,
    issue_date: date,
) -> AuthoredProducts:
    response.headers.update(NO_STORE)
    author.require_kind(kind)
    try:
        products = await service.list_authored(session, kind, issue_date)
        return AuthoredProducts(
            products=[StoredProductAdapter.validate_python(row) for row in products]
        )
    except (SQLAlchemyError, OSError, TimeoutError):
        raise WeatherUnavailable()


@router.post(
    "/wxproducts/products",
    response_model=StoredProduct,
    status_code=200,
    summary="Save, publish or withdraw a weather product",
    description="Checks live product access and expected revision; commits the product and actor history atomically.",
    tags=["wxproducts"],
    responses={
        401: {"model": AuthoringError, "description": "Sign-in required"},
        403: {"model": AuthoringError, "description": "Product access denied"},
        409: {"model": AuthoringError, "description": "Revision conflict"},
        422: {"model": AuthoringError, "description": "Invalid product"},
        503: {"model": AuthoringError, "description": "Weather database unavailable"},
    },
)
async def save_product(
    *,
    author: AuthorDep,
    session: AuthoringSessionDep,
    response: Response,
    body: ProductWrite,
) -> StoredProduct:
    response.headers.update(NO_STORE)
    author.require_kind(body.kind)
    try:
        product = await service.write_product(session, body, author.user)
        return StoredProductAdapter.validate_python(product)
    except (SQLAlchemyError, OSError, TimeoutError):
        raise WeatherUnavailable()


@router.get(
    "/wxproducts/products/{product_id}/history",
    response_model=ProductHistory,
    status_code=200,
    summary="Load weather product history",
    description="Returns up to 100 latest revisions for products the actor may author; never returns stored revision content.",
    tags=["wxproducts"],
    responses={
        401: {"model": AuthoringError, "description": "Sign-in required"},
        403: {"model": AuthoringError, "description": "Product access denied"},
        503: {"model": AuthoringError, "description": "Weather database unavailable"},
    },
)
async def load_history(
    *,
    author: AuthorDep,
    session: AuthoringSessionDep,
    response: Response,
    product_id: UUID,
) -> ProductHistory:
    response.headers.update(NO_STORE)
    try:
        rows = await service.history(session, product_id, author.allowed_kinds)
        return ProductHistory(
            history=[ProductHistoryEntry.model_validate(row) for row in rows]
        )
    except (SQLAlchemyError, OSError, TimeoutError):
        raise WeatherUnavailable()


@router.get(
    "/wxproducts/public/forecast",
    response_model=PublicForecast,
    status_code=200,
    summary="Select the public forecast periods",
    description="Five forecast periods selected using the server clock, with source revisions and explicit UTC validity times.",
    tags=["wxproducts"],
    responses={503: {"model": ProductFeedError}},
)
async def public_forecast(
    *, session: WxProductsSessionDep, response: Response
) -> PublicForecast | JSONResponse:
    response.headers.update(NO_STORE)
    if session is not None:
        try:
            return await forecast.load_forecast(session, datetime.now(UTC))
        except (SQLAlchemyError, OSError, TimeoutError, ValidationError):
            logger.warning("Public forecast unavailable")
    return JSONResponse(
        {"error": "Forecast information is unavailable"},
        status_code=503,
        headers=NO_STORE,
    )


def aviation_view(row: AviationDraft) -> AviationDraftRead:
    return AviationDraftRead(
        **row.content,
        id=row.id,
        revision=row.revision,
        actor_id=row.actor_id,
        actor_name=row.actor_name,
        updated_at=row.updated_at,
    )


@router.get(
    "/wxproducts/aviation/drafts",
    response_model=AviationDraftList,
    tags=["wxproducts"],
    responses={403: {"model": AuthoringError}, 503: {"model": AuthoringError}},
)
async def load_aviation_drafts(
    *,
    author: AuthorDep,
    session: AuthoringSessionDep,
    response: Response,
    kind: AviationKind,
    station: Annotated[str, Query(pattern=r"^[A-Z]{4}$")],
) -> AviationDraftList:
    response.headers.update(NO_STORE)
    author.require_kind("aviation")
    try:
        rows = await service.list_aviation_drafts(session, kind, station)
        return AviationDraftList(drafts=[aviation_view(row) for row in rows])
    except (SQLAlchemyError, OSError, TimeoutError):
        raise WeatherUnavailable()


@router.post(
    "/wxproducts/aviation/drafts",
    response_model=AviationDraftRead,
    tags=["wxproducts"],
    responses={
        403: {"model": AuthoringError},
        409: {"model": AuthoringError},
        503: {"model": AuthoringError},
    },
)
async def save_aviation_draft(
    *,
    author: AuthorDep,
    session: AuthoringSessionDep,
    response: Response,
    body: AviationDraftWrite,
) -> AviationDraftRead:
    response.headers.update(NO_STORE)
    author.require_kind("aviation")
    try:
        return aviation_view(
            await service.save_aviation_draft(session, body, author.user)
        )
    except (SQLAlchemyError, OSError, TimeoutError):
        raise WeatherUnavailable()


@router.get(
    "/wxproducts/aviation/drafts/{draft_id}/history",
    response_model=AviationHistory,
    tags=["wxproducts"],
    responses={403: {"model": AuthoringError}, 503: {"model": AuthoringError}},
)
async def load_aviation_history(
    *,
    author: AuthorDep,
    session: AuthoringSessionDep,
    response: Response,
    draft_id: UUID,
) -> AviationHistory:
    response.headers.update(NO_STORE)
    author.require_kind("aviation")
    try:
        rows = await service.aviation_history(session, draft_id)
        return AviationHistory(
            revisions=[
                AviationRevisionRead(
                    **row.content,
                    revision=row.revision,
                    actor_id=row.actor_id,
                    actor_name=row.actor_name,
                    recorded_at=row.recorded_at,
                )
                for row in rows
            ]
        )
    except (SQLAlchemyError, OSError, TimeoutError):
        raise WeatherUnavailable()


@router.post(
    "/wxproducts/products/preview",
    response_model=ProductPreview,
    status_code=200,
    summary="Validate and preview a weather product",
    description="Normalizes the schedule and checks publication content without saving. Publication still requires review and revalidation.",
    tags=["wxproducts"],
    responses={
        401: {"model": AuthoringError},
        403: {"model": AuthoringError},
        422: {"model": AuthoringError},
    },
)
async def preview_product(
    *, author: AuthorDep, response: Response, body: ProductPreviewInput
) -> ProductPreview:
    author.require_kind(body.kind)
    response.headers.update(NO_STORE)
    return validation.preview(body)


@router.get(
    "/wxproducts/products/{product_id}/revisions/{revision}/pdf",
    response_class=Response,
    status_code=200,
    summary="Download a saved weather revision PDF",
    description="Staff-only saved revision export; drafts and historical publications are explicitly labelled. Does not publish or change records.",
    tags=["wxproducts"],
    responses={
        200: {
            "content": {
                "application/pdf": {"schema": {"type": "string", "format": "binary"}}
            }
        },
        401: {"model": AuthoringError},
        403: {"model": AuthoringError},
        404: {"model": AuthoringError},
        503: {"model": AuthoringError},
    },
)
async def product_revision_pdf(
    *, author: AuthorDep, session: AuthoringSessionDep, product_id: UUID, revision: int
) -> Response:
    try:
        source = await service.pdf_source(
            session, product_id, revision, author.allowed_kinds
        )
        content = await run_in_threadpool(pdf.render_product_pdf, source)
    except (SQLAlchemyError, OSError, TimeoutError):
        raise WeatherUnavailable()
    return Response(
        content,
        media_type="application/pdf",
        headers={
            **NO_STORE,
            "Content-Disposition": f'attachment; filename="gms-{source.kind}-{product_id}-r{revision}.pdf"',
            "X-Content-Type-Options": "nosniff",
        },
    )
