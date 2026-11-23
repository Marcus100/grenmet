"""Commerce organisation routes: /api/v1/commerce/org/... (ADR-0025 org zone).

Acts for the organisation in ``X-Barrels-Organisation`` and needs an
organisation-bound commerce key (see ``dependencies.py``). Writes that create
something take an ``Idempotency-Key`` (ADR-0026). Thin: validation in the
schemas, rules in ``service.py``.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Response, status

from src import idempotency
from src.commerce import schemas, service
from src.commerce.constants import BaseUnit, Currency
from src.commerce.dependencies import CommerceCatalogueManager, CommerceSeller
from src.commerce.models import Price
from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.pagination import PaginatedResponse, PaginationDep

router = APIRouter(prefix="/commerce/org", tags=["commerce"])

READ_ERRORS = {**AUTHENTICATED, **NOT_FOUND}
WRITE_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}


def _product_public(row: service.ProductRow) -> schemas.ProductPublic:
    price = row.current_price
    return schemas.ProductPublic(
        id=row.product.id,
        name=row.product.name,
        base_unit=BaseUnit(row.product.base_unit),
        current_price=None if price is None else _price_public(price),
        created_at=row.product.created_at,
    )


def _price_public(price: Price) -> schemas.PricePublic:
    return schemas.PricePublic(
        id=price.id,
        product_id=price.product_id,
        amount_minor=price.amount_minor,
        currency=Currency(price.currency),
        effective_from=price.effective_from,
        created_at=price.created_at,
    )


@router.get(
    "/products",
    response_model=PaginatedResponse[schemas.ProductPublic],
    status_code=status.HTTP_200_OK,
    summary="List products",
    description="The organisation's products by name, each with the price in force now.",
    operation_id="commerceOrgListProducts",
    responses=READ_ERRORS,
)
async def list_products(
    *, session: SessionDep, org: CommerceSeller, pagination: PaginationDep
) -> Any:
    rows, total = await service.list_products(
        session, organisation_id=org.organisation_id, page=pagination
    )
    return PaginatedResponse(
        data=[_product_public(row) for row in rows],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.post(
    "/products",
    response_model=schemas.ProductPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create product",
    description="Adds a product to the organisation. Names are unique per organisation.",
    operation_id="commerceOrgCreateProduct",
    responses=WRITE_ERRORS,
)
async def create_product(
    *,
    session: SessionDep,
    response: Response,
    org: CommerceCatalogueManager,
    idempotency_key: idempotency.RequiredIdempotencyKey,
    payload: schemas.ProductCreate,
) -> Any:
    async def handler() -> idempotency.HandlerResult:
        row = await service.create_product(
            session,
            organisation_id=org.organisation_id,
            actor_id=org.user.id,
            payload=payload,
        )
        body = _product_public(row).model_dump(mode="json")
        return status.HTTP_201_CREATED, body

    result = await idempotency.run_idempotent(
        session,
        scope="commerce.product-create",
        organisation_id=org.organisation_id,
        key=idempotency_key,
        request_body=payload.model_dump(mode="json"),
        handler=handler,
    )
    await session.commit()
    response.status_code = result.status_code
    if result.replayed:
        response.headers["Idempotency-Replayed"] = "true"
    return result.body


@router.get(
    "/products/{product_id}",
    response_model=schemas.ProductPublic,
    status_code=status.HTTP_200_OK,
    summary="Get product",
    description="One product of the organisation with the price in force now.",
    operation_id="commerceOrgGetProduct",
    responses=READ_ERRORS,
)
async def get_product(
    *, session: SessionDep, org: CommerceSeller, product_id: uuid.UUID
) -> Any:
    row = await service.get_product(
        session, organisation_id=org.organisation_id, product_id=product_id
    )
    return _product_public(row)


@router.post(
    "/products/{product_id}/prices",
    response_model=schemas.PricePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add price",
    description=(
        "Starts a new price for a product from ``effective_from`` (default now). "
        "Earlier prices are kept as history; a second price at the same instant is refused."
    ),
    operation_id="commerceOrgAddPrice",
    responses=WRITE_ERRORS,
)
async def add_price(
    *,
    session: SessionDep,
    response: Response,
    org: CommerceCatalogueManager,
    product_id: uuid.UUID,
    idempotency_key: idempotency.RequiredIdempotencyKey,
    payload: schemas.PriceCreate,
) -> Any:
    async def handler() -> idempotency.HandlerResult:
        price = await service.add_price(
            session,
            organisation_id=org.organisation_id,
            actor_id=org.user.id,
            product_id=product_id,
            payload=payload,
        )
        return status.HTTP_201_CREATED, _price_public(price).model_dump(mode="json")

    result = await idempotency.run_idempotent(
        session,
        scope="commerce.price-add",
        organisation_id=org.organisation_id,
        key=idempotency_key,
        request_body={
            "product_id": str(product_id),
            **payload.model_dump(mode="json"),
        },
        handler=handler,
    )
    await session.commit()
    response.status_code = result.status_code
    if result.replayed:
        response.headers["Idempotency-Replayed"] = "true"
    return result.body


@router.get(
    "/products/{product_id}/prices",
    response_model=PaginatedResponse[schemas.PricePublic],
    status_code=status.HTTP_200_OK,
    summary="List prices",
    description="A product's price history, newest effective date first.",
    operation_id="commerceOrgListPrices",
    responses=READ_ERRORS,
)
async def list_prices(
    *,
    session: SessionDep,
    org: CommerceSeller,
    product_id: uuid.UUID,
    pagination: PaginationDep,
) -> Any:
    rows, total = await service.list_prices(
        session,
        organisation_id=org.organisation_id,
        product_id=product_id,
        page=pagination,
    )
    return PaginatedResponse(
        data=[_price_public(row) for row in rows],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )
