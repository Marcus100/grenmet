"""Authenticated NHC guidance and durable operator requests."""

from datetime import date
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, Response

from src.auth.browser import BrowserUser
from src.exceptions import AuthorizationError
from src.models import ApiError
from src.wxproducts.dependencies import AuthorDep, ProductAuthor
from src.wxproducts.exceptions import ProductValidationError

from . import nhc_service
from .dependencies import ImageSession
from .nhc_schemas import (
    NhcContent,
    NhcFamily,
    NhcJob,
    NhcPage,
    NhcPointRequest,
    NhcPrefill,
    NhcPrefillRequest,
    NhcPullRequest,
    NhcSourceCheck,
)

router = APIRouter(prefix="/wxwatch/nhc", tags=["wxwatch-nhc"])
ERRORS: dict[int | str, dict[str, Any]] = {
    401: {"model": ApiError, "description": "Sign-in required"},
    403: {"model": ApiError, "description": "Product access denied"},
    404: {"model": ApiError, "description": "Edition or request not found"},
    503: {"description": "NHC archive unavailable"},
}


def require_operator(author: ProductAuthor) -> None:
    if not set(author.allowed_kinds) & {"outlook", "cyclone", "marine"}:
        raise AuthorizationError(
            "NHC pulls require tropical or marine product author access"
        )


@router.get(
    "/editions",
    response_model=NhcPage,
    status_code=200,
    summary="Browse NHC guidance",
    description="Latest active products or collected edition history; meteorological and collection times remain separate.",
    responses=ERRORS,
)
async def editions(
    *,
    _user: BrowserUser,
    session: ImageSession,
    response: Response,
    family: NhcFamily | None = None,
    product: Annotated[str | None, Query(max_length=300)] = None,
    storm: Annotated[str | None, Query(pattern=r"^al\d{6}$")] = None,
    start: date | None = None,
    end: date | None = None,
    latest: bool = True,
    offset: Annotated[int, Query(ge=0, le=100000)] = 0,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
) -> NhcPage:

    if start and end and start > end or end == date.max:
        raise ProductValidationError(["Invalid date range"])
    response.headers["Cache-Control"] = "private, no-store"
    return await nhc_service.browse(
        session,
        family=family,
        product=product,
        storm=storm,
        start=start,
        end=end,
        latest=latest,
        offset=offset,
        limit=limit,
    )


@router.get(
    "/editions/{edition_id}",
    response_model=NhcContent,
    status_code=200,
    summary="Read NHC edition",
    description="Read preserved source content, decoded fields and verified asset references.",
    responses=ERRORS,
)
async def edition(
    *, edition_id: UUID, _user: BrowserUser, session: ImageSession, response: Response
) -> NhcContent:
    response.headers["Cache-Control"] = "private, no-store"
    return await nhc_service.content(session, edition_id)


@router.post(
    "/pulls",
    response_model=NhcJob,
    status_code=202,
    summary="Pull latest NHC guidance",
    description="Queue an on-demand collection. Concurrent pulls coalesce; no periodic collection is installed.",
    responses=ERRORS,
)
async def pull(
    *,
    author: AuthorDep,
    session: ImageSession,
    payload: NhcPullRequest,
    response: Response,
) -> NhcJob:
    require_operator(author)
    response.headers["Cache-Control"] = "private, no-store"
    return await nhc_service.create_job(
        session, "pull", payload.model_dump(), author.user.id
    )


@router.get(
    "/jobs/{job_id}",
    response_model=NhcJob,
    status_code=200,
    summary="Read NHC request progress",
    description="Read durable collection or point-query progress and per-product outcomes.",
    responses=ERRORS,
)
async def request_status(
    *, job_id: UUID, _user: BrowserUser, session: ImageSession, response: Response
) -> NhcJob:
    response.headers["Cache-Control"] = "private, no-store"
    return await nhc_service.job(session, job_id)


@router.post(
    "/points",
    response_model=NhcJob,
    status_code=202,
    summary="Sample an NHC grid",
    description="Queue nearest native-cell sampling for a selected grid edition; no interpolation or local forecast inference.",
    responses=ERRORS,
)
async def point(
    *,
    author: AuthorDep,
    session: ImageSession,
    payload: NhcPointRequest,
    response: Response,
) -> NhcJob:

    require_operator(author)
    item = await nhc_service.content(session, payload.edition_id)
    if item.edition.kind != "grid":
        raise ProductValidationError(["Select a grid edition"])
    raw_bbox = item.decoded.get("bbox")
    bbox = (
        [float(value) for value in raw_bbox if isinstance(value, (int, float))]
        if isinstance(raw_bbox, list)
        else []
    )
    if (
        not isinstance(bbox, list)
        or len(bbox) != 4
        or not bbox[0] <= payload.longitude <= bbox[2]
        or not bbox[1] <= payload.latitude <= bbox[3]
    ):
        raise ProductValidationError(["Location is outside decoded grid coverage"])
    response.headers["Cache-Control"] = "private, no-store"
    return await nhc_service.create_job(
        session, "point", payload.model_dump(mode="json"), author.user.id
    )


@router.post(
    "/prefill",
    response_model=NhcPrefill,
    status_code=200,
    summary="Propose GMS product fields",
    description="Prepare deterministic proposals and exact source references; accepting or publishing remains a forecaster action.",
    responses=ERRORS,
)
async def propose(
    *,
    author: AuthorDep,
    session: ImageSession,
    payload: NhcPrefillRequest,
    response: Response,
) -> NhcPrefill:
    author.require_kind(payload.kind)
    response.headers["Cache-Control"] = "private, no-store"

    try:
        return await nhc_service.prefill(
            session,
            payload.kind,
            payload.edition_ids,
            payload.zone_id,
            payload.period_label,
            payload.point_job_ids,
        )
    except ValueError as error:
        raise ProductValidationError([str(error)]) from error


@router.get(
    "/source-checks",
    response_model=list[NhcSourceCheck],
    status_code=200,
    summary="Check selected NHC sources",
    description="Identify newer editions without changing authored content or publications.",
    responses=ERRORS,
)
async def source_checks(
    *,
    _user: BrowserUser,
    session: ImageSession,
    edition_ids: Annotated[list[UUID], Query(min_length=1, max_length=30)],
    response: Response,
) -> list[dict[str, Any]]:
    response.headers["Cache-Control"] = "private, no-store"
    return await nhc_service.check_sources(session, edition_ids)
