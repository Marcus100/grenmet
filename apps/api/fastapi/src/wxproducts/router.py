import logging
from datetime import UTC, date, datetime
from typing import Annotated, Any, get_args
from uuid import UUID

from fastapi import APIRouter, Query, Response, status
from fastapi.responses import JSONResponse
from pydantic import TypeAdapter, ValidationError
from sqlalchemy.exc import SQLAlchemyError
from starlette.concurrency import run_in_threadpool

from src.exceptions import NotFoundError
from src.utils.filenames import content_disposition

from . import (
    advisories,
    aviation_rules,
    forecast,
    forecast_pdf,
    guidance,
    pdf,
    service,
    tropical_systems,
    validation,
)
from .dependencies import (
    AdvisorySessionDep,
    AuthorDep,
    AuthoringSessionDep,
    WxProductsSessionDep,
)
from .exceptions import ProductValidationError, WeatherUnavailable
from .filenames import product_pdf_filename
from .models import AviationDraft, TropicalSystem
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
    AviationValidationRequest,
    AviationValidationResponse,
    ProductFeedError,
    ProductHistory,
    ProductHistoryEntry,
    ProductKind,
    ProductPreview,
    ProductPreviewInput,
    ProductWrite,
    PublicForecast,
    PublicProductDetail,
    PublicPublishedProduct,
    PublishedProducts,
    StoredProduct,
    StoredProductAdapter,
    TropicalSystemCreate,
    TropicalSystemEntryRead,
    TropicalSystemHistory,
    TropicalSystemList,
    TropicalSystemPublic,
    TropicalSystemPublicEntry,
    TropicalSystemPublicHistory,
    TropicalSystemPublicList,
    TropicalSystemRead,
    TropicalSystemStatus,
    TropicalSystemUpdate,
    values_as_dict,
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
        except SQLAlchemyError, OSError, TimeoutError, ValidationError:
            logger.warning("Weather product feed unavailable")
    return JSONResponse(
        {"error": "Product information is unavailable"},
        status_code=503,
        headers=NO_STORE,
    )


@router.get(
    "/wxproducts/public/products/{product_id}",
    response_model=PublicProductDetail,
    status_code=status.HTTP_200_OK,
    summary="Get one published weather product",
    description="Anonymous read of one published snapshot for editorial links. Stays readable after it expires (`current` is false); withdrawn or unknown products are 404.",
    tags=["wxproducts"],
    responses={404: {"model": ProductFeedError}, 503: {"model": ProductFeedError}},
)
async def get_public_product(
    *, session: WxProductsSessionDep, response: Response, product_id: UUID
) -> PublicProductDetail | JSONResponse:
    response.headers.update(NO_STORE)
    if session is not None:
        try:
            found = await service.get_published_product(session, product_id)
        except SQLAlchemyError, OSError, TimeoutError:
            logger.warning("Weather product unavailable")
        else:
            if found is None:
                return JSONResponse(
                    {"error": "Product not found"}, status_code=404, headers=NO_STORE
                )
            product, current = found
            return PublicProductDetail.model_validate(
                {
                    **product.model_dump(mode="json", exclude_none=True),
                    "current": current,
                }
            )
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
    description="Page through all saved products the author may access, newest update first. Optionally filter by kind or issue date (including undated drafts).",
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
    kind: ProductKind | None = None,
    issue_date: date | None = None,
    limit: int = Query(default=100, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=100000),
) -> AuthoredProducts:
    response.headers.update(NO_STORE)
    if kind is not None:
        author.require_kind(kind)
    try:
        products = await service.list_authored(
            session,
            kind,
            issue_date,
            allowed_kinds=author.allowed_kinds,
            limit=limit,
            offset=offset,
        )
        return AuthoredProducts(
            products=[StoredProductAdapter.validate_python(row) for row in products]
        )
    except SQLAlchemyError, OSError, TimeoutError:
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
    cap_session: AdvisorySessionDep,
    response: Response,
    body: ProductWrite,
) -> StoredProduct:
    response.headers.update(NO_STORE)
    author.require_kind(body.kind)
    if body.action != "withdraw":
        body.guidance = await guidance.validate(body.guidance)
    snapshot = (
        await advisories.snapshot(cap_session, session)
        if body.kind in validation.ISSUE_HOURS and body.action != "withdraw"
        else None
    )
    try:
        product = await service.write_product(
            session, body, author.user, advisories=snapshot
        )
        return StoredProductAdapter.validate_python(product)
    except SQLAlchemyError, OSError, TimeoutError:
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
    except SQLAlchemyError, OSError, TimeoutError:
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
        except SQLAlchemyError, OSError, TimeoutError, ValidationError:
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
    summary="List aviation drafts",
    description="Returns aviation product drafts for the requested product kind and station. Authoring access is required.",
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
    except SQLAlchemyError, OSError, TimeoutError:
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
    summary="Save an aviation draft",
    description="Creates or updates an aviation product draft for the requested station and product kind.",
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
    except SQLAlchemyError, OSError, TimeoutError:
        raise WeatherUnavailable()


@router.post(
    "/wxproducts/aviation/drafts/validate",
    response_model=AviationValidationResponse,
    tags=["wxproducts"],
    responses={403: {"model": AuthoringError}},
    summary="Validate a coded METAR, SPECI or TAF",
    description=(
        "Checks the coded text against WMO-No. 306 FM 15/16/51 and ICAO Annex 3 "
        "coding rules. Findings are advisory: errors are code violations, warnings "
        "are reporting practice. Nothing is saved, issued or transmitted."
    ),
)
async def validate_aviation_message(
    *,
    author: AuthorDep,
    response: Response,
    body: AviationValidationRequest,
) -> AviationValidationResponse:
    response.headers.update(NO_STORE)
    author.require_kind("aviation")
    issues = aviation_rules.validate_aviation(
        body.kind,
        body.station,
        body.message,
        observed_at=body.observed_at,
        issued_at=body.issued_at,
        valid_from=body.valid_from,
        valid_to=body.valid_to,
        previous_message=body.previous_message,
    )
    return AviationValidationResponse(
        valid=not any(issue.severity == "error" for issue in issues), issues=issues
    )


@router.get(
    "/wxproducts/aviation/drafts/{draft_id}/history",
    response_model=AviationHistory,
    tags=["wxproducts"],
    responses={403: {"model": AuthoringError}, 503: {"model": AuthoringError}},
    summary="List aviation draft history",
    description="Returns the recorded revisions of an aviation product draft in revision order.",
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
    except SQLAlchemyError, OSError, TimeoutError:
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
    *,
    author: AuthorDep,
    response: Response,
    body: ProductPreviewInput,
    cap_session: AdvisorySessionDep,
    weather_session: WxProductsSessionDep,
) -> ProductPreview:
    author.require_kind(body.kind)
    body.guidance = await guidance.validate(body.guidance)
    response.headers.update(NO_STORE)
    snapshot = (
        await advisories.snapshot(cap_session, weather_session)
        if body.kind in validation.ISSUE_HOURS
        else None
    )
    return validation.preview(
        body,
        forecaster=author.user.full_name or author.user.email,
        advisories=snapshot,
    )


@router.post(
    "/wxproducts/products/preview/pdf",
    response_class=Response,
    status_code=200,
    summary="Render a draft product PDF preview",
    description="Renders unsaved forecast, bulletin or outlook content with the issued PDF layout, watermarked as a draft preview. Nothing is saved or published.",
    tags=["wxproducts"],
    responses={
        200: {
            "content": {
                "application/pdf": {"schema": {"type": "string", "format": "binary"}}
            }
        },
        401: {"model": AuthoringError},
        403: {"model": AuthoringError},
        422: {"model": AuthoringError},
    },
)
async def preview_product_pdf(
    *,
    author: AuthorDep,
    body: ProductPreviewInput,
    cap_session: AdvisorySessionDep,
    weather_session: WxProductsSessionDep,
) -> Response:
    author.require_kind(body.kind)
    body.guidance = await guidance.validate(body.guidance)
    if body.kind not in forecast_pdf.SHEET_KINDS:
        raise ProductValidationError(["PDF preview is not available for this product"])
    snapshot = (
        await advisories.snapshot(cap_session, weather_session)
        if body.kind in validation.ISSUE_HOURS
        else None
    )
    values = validation.normalize(
        body.kind,
        guidance.compose(body.kind, values_as_dict(body.values), body.guidance),
        forecaster=author.user.full_name or author.user.email,
        advisories=snapshot,
    )
    content = await run_in_threadpool(
        forecast_pdf.render_sheet_pdf,
        body.kind,
        values,
        status="DRAFT PREVIEW — NOT FOR ISSUE",
        revision="Unsaved draft preview",
        guidance=body.guidance,
        graphic_images=await guidance.images(body.guidance),
    )
    return Response(
        content,
        media_type="application/pdf",
        headers={
            **NO_STORE,
            "Content-Disposition": content_disposition(
                "inline",
                product_pdf_filename(body.kind, values, recorded_at=None),
            ),
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get(
    "/wxproducts/products/{product_id}/revisions/{revision}/pdf",
    response_class=Response,
    status_code=200,
    summary="Download a saved weather revision PDF",
    description="Staff-only saved revision export; drafts and historical publications are explicitly labelled. Does not publish or change records. The download file name is human and dated, for example 'GMS Morning Forecast 2026-10-23 0700 (rev 3).pdf'.",
    tags=["wxproducts"],
    responses={
        200: {
            "headers": {
                "Content-Disposition": {
                    "description": "Attachment with a human, dated file name (ASCII filename plus RFC 6266 filename*).",
                    "schema": {"type": "string"},
                }
            },
            "content": {
                "application/pdf": {"schema": {"type": "string", "format": "binary"}}
            },
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
        content = await run_in_threadpool(
            pdf.render_product_pdf,
            source,
            graphic_images=await guidance.images(source.guidance),
        )
    except SQLAlchemyError, OSError, TimeoutError:
        raise WeatherUnavailable()
    return Response(
        content,
        media_type="application/pdf",
        headers={
            **NO_STORE,
            "Content-Disposition": content_disposition(
                "attachment",
                product_pdf_filename(
                    source.kind,
                    values_as_dict(source.values),
                    recorded_at=source.recorded_at,
                    revision=revision,
                ),
            ),
            "X-Content-Type-Options": "nosniff",
        },
    )


STAFF_ERRORS: dict[int | str, dict[str, Any]] = {
    401: {"model": AuthoringError, "description": "Sign-in required"},
    403: {"model": AuthoringError, "description": "Outlook product access denied"},
    503: {"model": AuthoringError, "description": "Weather database unavailable"},
}


def system_view(system: TropicalSystem) -> TropicalSystemRead:
    return TropicalSystemRead.model_validate(system)


@router.get(
    "/wxproducts/tropical-systems",
    response_model=TropicalSystemList,
    status_code=200,
    summary="List tracked tropical systems",
    description="Tracked systems newest first, optionally filtered by status and season. Needs product access to the outlook.",
    tags=["wxproducts"],
    responses=STAFF_ERRORS,
)
async def list_tropical_systems(
    *,
    author: AuthorDep,
    session: AuthoringSessionDep,
    response: Response,
    status_filter: Annotated[TropicalSystemStatus | None, Query(alias="status")] = None,
    season: Annotated[int | None, Query(ge=2000, le=2100)] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0, le=10000)] = 0,
) -> TropicalSystemList:
    response.headers.update(NO_STORE)
    author.require_kind(tropical_systems.TRACKED_KIND)
    try:
        rows = await tropical_systems.list_systems(
            session, status=status_filter, season=season, limit=limit, offset=offset
        )
    except SQLAlchemyError, OSError, TimeoutError:
        raise WeatherUnavailable()
    return TropicalSystemList(systems=[system_view(row) for row in rows])


@router.post(
    "/wxproducts/tropical-systems",
    response_model=TropicalSystemRead,
    status_code=status.HTTP_201_CREATED,
    summary="Start tracking a tropical system",
    description="Creates a tracked system by hand and assigns its season label, for example 'GMS 2026-07'.",
    tags=["wxproducts"],
    responses={
        **STAFF_ERRORS,
        409: {"model": AuthoringError, "description": "NHC storm identifier in use"},
        422: {"model": AuthoringError, "description": "Invalid system"},
    },
)
async def create_tropical_system(
    *,
    author: AuthorDep,
    session: AuthoringSessionDep,
    response: Response,
    body: TropicalSystemCreate,
) -> TropicalSystemRead:
    response.headers.update(NO_STORE)
    author.require_kind(tropical_systems.TRACKED_KIND)
    try:
        system = await tropical_systems.create_system(session, body, author.user)
    except SQLAlchemyError, OSError, TimeoutError:
        raise WeatherUnavailable()
    return system_view(system)


@router.patch(
    "/wxproducts/tropical-systems/{system_id}",
    response_model=TropicalSystemRead,
    status_code=200,
    summary="Update a tracked tropical system",
    description="Rename it, link NHC identifiers, close it (dissipated, merged, out of area or duplicate) or reopen it. A merged system names the system it continues as.",
    tags=["wxproducts"],
    responses={
        **STAFF_ERRORS,
        404: {"model": AuthoringError, "description": "Tracked system not found"},
        409: {"model": AuthoringError, "description": "NHC storm identifier in use"},
        422: {"model": AuthoringError, "description": "Invalid change"},
    },
)
async def update_tropical_system(
    *,
    author: AuthorDep,
    session: AuthoringSessionDep,
    response: Response,
    system_id: UUID,
    body: TropicalSystemUpdate,
) -> TropicalSystemRead:
    response.headers.update(NO_STORE)
    author.require_kind(tropical_systems.TRACKED_KIND)
    try:
        system = await tropical_systems.update_system(
            session, system_id, body, author.user
        )
    except SQLAlchemyError, OSError, TimeoutError:
        raise WeatherUnavailable()
    return system_view(system)


@router.get(
    "/wxproducts/tropical-systems/{system_id}/history",
    response_model=TropicalSystemHistory,
    status_code=200,
    summary="Load a tracked system's history",
    description="Every outlook entry for the system, oldest first, drafts included.",
    tags=["wxproducts"],
    responses={
        **STAFF_ERRORS,
        404: {"model": AuthoringError, "description": "Tracked system not found"},
    },
)
async def load_tropical_system_history(
    *,
    author: AuthorDep,
    session: AuthoringSessionDep,
    response: Response,
    system_id: UUID,
) -> TropicalSystemHistory:
    response.headers.update(NO_STORE)
    author.require_kind(tropical_systems.TRACKED_KIND)
    try:
        system = await tropical_systems.get_system(session, system_id)
        entries = await tropical_systems.history(
            session, system_id, published_only=False
        )
    except SQLAlchemyError, OSError, TimeoutError:
        raise WeatherUnavailable()
    return TropicalSystemHistory(
        system=system_view(system),
        entries=[TropicalSystemEntryRead.model_validate(entry) for entry in entries],
    )


@router.get(
    "/wxproducts/public/tropical-systems",
    response_model=TropicalSystemPublicList,
    status_code=200,
    summary="List active tropical systems",
    description="Anonymous list of active tracked systems that appear in a published outlook, each with its latest published entry. Drafts are never shown.",
    tags=["wxproducts"],
    responses={503: {"model": AuthoringError}},
)
async def list_public_tropical_systems(
    *, session: AuthoringSessionDep, response: Response
) -> TropicalSystemPublicList:
    response.headers.update(NO_STORE)
    try:
        rows = await tropical_systems.public_active(session)
    except SQLAlchemyError, OSError, TimeoutError:
        raise WeatherUnavailable()
    return TropicalSystemPublicList(
        systems=[
            TropicalSystemPublic.model_validate(
                {
                    **system_view(system).model_dump(),
                    "latest": TropicalSystemPublicEntry.model_validate(entry),
                }
            )
            for system, entry in rows
        ]
    )


@router.get(
    "/wxproducts/public/tropical-systems/{system_id}",
    response_model=TropicalSystemPublicHistory,
    status_code=200,
    summary="Get one tropical system's published history",
    description="Anonymous history of positions and formation chances from published outlooks only, oldest first. A system that was never published is 404.",
    tags=["wxproducts"],
    responses={404: {"model": AuthoringError}, 503: {"model": AuthoringError}},
)
async def get_public_tropical_system(
    *, session: AuthoringSessionDep, response: Response, system_id: UUID
) -> TropicalSystemPublicHistory:
    response.headers.update(NO_STORE)
    try:
        system = await tropical_systems.get_system(session, system_id)
        entries = await tropical_systems.history(
            session, system_id, published_only=True
        )
    except SQLAlchemyError, OSError, TimeoutError:
        raise WeatherUnavailable()
    if not entries:
        raise NotFoundError("Tracked system not found")
    return TropicalSystemPublicHistory.model_validate(
        {
            **system_view(system).model_dump(),
            "entries": [
                TropicalSystemPublicEntry.model_validate(entry) for entry in entries
            ],
        }
    )
