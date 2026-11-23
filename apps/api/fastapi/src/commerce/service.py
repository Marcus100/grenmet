"""Commerce business logic: products and price history (ADR-0063, slice 0).

Every function takes the organisation as a required argument and filters on it
in SQL. Functions flush and never commit; the router owns the transaction.
Current prices are chosen in SQL (``DISTINCT ON``), never by loading the history.
"""

import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import cast

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased
from sqlalchemy.orm.util import AliasedClass

from src.commerce import schemas
from src.commerce.constants import Currency
from src.commerce.exceptions import (
    PriceEffectiveFromTakenError,
    ProductNameTakenError,
    ProductNotFoundError,
)
from src.commerce.models import Price, Product
from src.pagination import PaginationParams
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class ProductRow:
    """A product with the price in force now (``None`` when it has none yet)."""

    product: Product
    current_price: Price | None


def _current_price(organisation_id: str, now: datetime) -> AliasedClass[Price]:
    """One price per product: the latest ``effective_from`` at or before ``now``."""
    latest = (
        select(Price)
        .where(Price.organisation_id == organisation_id, Price.effective_from <= now)
        .distinct(Price.product_id)
        .order_by(Price.product_id, Price.effective_from.desc())
        .subquery()
    )
    return cast(AliasedClass[Price], aliased(Price, latest))


def _naive_utc(value: datetime | None) -> datetime:
    if value is None:
        return utc_now()
    if value.tzinfo is None:
        return value
    return value.astimezone(UTC).replace(tzinfo=None)


async def list_products(
    session: AsyncSession, *, organisation_id: str, page: PaginationParams
) -> tuple[list[ProductRow], int]:
    now = utc_now()
    current = _current_price(organisation_id, now)
    total = await session.scalar(
        select(func.count())
        .select_from(Product)
        .where(Product.organisation_id == organisation_id)
    )
    result = await session.execute(
        select(Product, current)
        .outerjoin(current, current.product_id == Product.id)
        .where(Product.organisation_id == organisation_id)
        .order_by(Product.name, Product.id)
        .offset(page.skip)
        .limit(page.limit)
    )
    rows = [ProductRow(product=p, current_price=c) for p, c in result.all()]
    return rows, int(total or 0)


async def get_product(
    session: AsyncSession, *, organisation_id: str, product_id: uuid.UUID
) -> ProductRow:
    current = _current_price(organisation_id, utc_now())
    result = await session.execute(
        select(Product, current)
        .outerjoin(current, current.product_id == Product.id)
        .where(Product.id == product_id, Product.organisation_id == organisation_id)
    )
    row = result.first()
    if row is None:
        raise ProductNotFoundError()
    product, price = row
    return ProductRow(product=product, current_price=price)


async def create_product(
    session: AsyncSession,
    *,
    organisation_id: str,
    actor_id: uuid.UUID,
    payload: schemas.ProductCreate,
) -> ProductRow:
    product = Product(
        organisation_id=organisation_id,
        name=payload.name,
        base_unit=payload.base_unit.value,
        created_by=actor_id,
        created_at=utc_now(),
    )
    try:
        async with session.begin_nested():
            session.add(product)
            await session.flush()
    except IntegrityError as exc:
        raise ProductNameTakenError() from exc
    logger.info(
        "Commerce product created",
        extra={"organisation_id": organisation_id, "user_id": str(actor_id)},
    )
    return ProductRow(product=product, current_price=None)


async def add_price(
    session: AsyncSession,
    *,
    organisation_id: str,
    actor_id: uuid.UUID,
    product_id: uuid.UUID,
    payload: schemas.PriceCreate,
) -> Price:
    await get_product(session, organisation_id=organisation_id, product_id=product_id)
    price = Price(
        organisation_id=organisation_id,
        product_id=product_id,
        amount_minor=payload.amount_minor,
        currency=Currency(payload.currency).value,
        effective_from=_naive_utc(payload.effective_from),
        created_by=actor_id,
        created_at=utc_now(),
    )
    try:
        async with session.begin_nested():
            session.add(price)
            await session.flush()
    except IntegrityError as exc:
        raise PriceEffectiveFromTakenError() from exc
    logger.info(
        "Commerce price added",
        extra={"organisation_id": organisation_id, "user_id": str(actor_id)},
    )
    return price


async def list_prices(
    session: AsyncSession,
    *,
    organisation_id: str,
    product_id: uuid.UUID,
    page: PaginationParams,
) -> tuple[list[Price], int]:
    await get_product(session, organisation_id=organisation_id, product_id=product_id)
    total = await session.scalar(
        select(func.count())
        .select_from(Price)
        .where(Price.organisation_id == organisation_id, Price.product_id == product_id)
    )
    result = await session.scalars(
        select(Price)
        .where(Price.organisation_id == organisation_id, Price.product_id == product_id)
        .order_by(Price.effective_from.desc(), Price.id)
        .offset(page.skip)
        .limit(page.limit)
    )
    return list(result.all()), int(total or 0)
