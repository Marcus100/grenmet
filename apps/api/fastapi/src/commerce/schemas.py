"""API shapes for commerce (never the ORM models; ADR-0025, src/commerce/AGENTS.md)."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Annotated

from pydantic import Field, StrictInt, StringConstraints, field_validator

from src.commerce.constants import (
    MAX_AMOUNT_MINOR,
    PRODUCT_NAME_MAX_LENGTH,
    BaseUnit,
    Currency,
)
from src.models import BaseModel, UtcDateTime
from src.utils.datetime import utc_now

#: A price may start up to a year back (late entry of a price change) or five
#: years ahead (a scheduled change). Anything else is almost certainly a typo.
EFFECTIVE_FROM_PAST = timedelta(days=365)
EFFECTIVE_FROM_FUTURE = timedelta(days=365 * 5)

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
    #: Defaults to now. Naive values are read as UTC. Must fall within one year
    #: back and five years ahead of now (422 otherwise).
    effective_from: UtcDateTime | None = None

    @field_validator("effective_from")
    @classmethod
    def _within_window(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        try:
            naive = (
                value.astimezone(UTC).replace(tzinfo=None) if value.tzinfo else value
            )
        except (OverflowError, ValueError) as exc:
            # Year 1 or 9999 with an offset cannot be expressed in UTC.
            raise ValueError("effective_from is out of range") from exc
        now = utc_now()
        if not now - EFFECTIVE_FROM_PAST <= naive <= now + EFFECTIVE_FROM_FUTURE:
            raise ValueError(
                "effective_from must be within one year back or five years ahead"
            )
        return value


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
