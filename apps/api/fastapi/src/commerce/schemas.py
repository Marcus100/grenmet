"""API shapes for commerce (never the ORM models; ADR-0025, src/commerce/AGENTS.md)."""

import uuid
from typing import Annotated

from pydantic import Field, StrictInt, StringConstraints

from src.commerce.constants import (
    MAX_AMOUNT_MINOR,
    PRODUCT_NAME_MAX_LENGTH,
    BaseUnit,
    Currency,
)
from src.models import BaseModel, UtcDateTime

ProductName = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=1, max_length=PRODUCT_NAME_MAX_LENGTH
    ),
]


class ProductCreate(BaseModel):
    name: ProductName
    base_unit: BaseUnit


class PriceCreate(BaseModel):
    #: Strict: a float, a numeric string or a boolean is refused, not coerced.
    amount_minor: Annotated[StrictInt, Field(ge=0, le=MAX_AMOUNT_MINOR)]
    currency: Currency = Currency.XCD
    #: Defaults to now. Naive values are read as UTC.
    effective_from: UtcDateTime | None = None


class PricePublic(BaseModel):
    id: uuid.UUID
    product_id: uuid.UUID
    amount_minor: int
    currency: Currency
    effective_from: UtcDateTime
    created_at: UtcDateTime


class ProductPublic(BaseModel):
    id: uuid.UUID
    name: str
    base_unit: BaseUnit
    #: The price in force now (latest ``effective_from`` not in the future).
    current_price: PricePublic | None
    created_at: UtcDateTime
