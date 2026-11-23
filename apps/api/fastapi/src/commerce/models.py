"""Commerce tables in the ``commerce`` schema (ADR-0063, section 3).

Every row carries ``organisation_id``; services filter on it in SQL. Prices are
history: a row is never edited (trigger ``price_append_only``, migration
``commerce20261123``); a delete is allowed only as part of erasing the owning
organisation.
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from src.commerce.constants import (
    MAX_AMOUNT_MINOR,
    PRODUCT_NAME_MAX_LENGTH,
    BaseUnit,
    Currency,
)
from src.orm import Base
from src.utils.datetime import utc_now

_BASE_UNITS = ", ".join(f"'{unit.value}'" for unit in BaseUnit)


class Product(Base):
    __tablename__ = "product"
    __table_args__ = (
        UniqueConstraint("organisation_id", "name"),
        CheckConstraint(f"base_unit IN ({_BASE_UNITS})", name="base_unit_values"),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(PRODUCT_NAME_MAX_LENGTH))
    base_unit: Mapped[str] = mapped_column(String(20))
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class Price(Base):
    __tablename__ = "price"
    __table_args__ = (
        UniqueConstraint("product_id", "effective_from"),
        CheckConstraint(
            f"amount_minor >= 0 AND amount_minor <= {MAX_AMOUNT_MINOR}",
            name="amount_range",
        ),
        CheckConstraint(
            f"currency IN ('{Currency.XCD.value}')", name="currency_values"
        ),
        {"schema": "commerce"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        ForeignKey("org.organisation.id", ondelete="CASCADE"), index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("commerce.product.id", ondelete="CASCADE"), index=True
    )
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3), default=Currency.XCD.value)
    effective_from: Mapped[datetime]
    #: Who made the row, kept as an id only: no foreign key, so erasing a user
    #: never has to UPDATE an append-only price row.
    created_by: Mapped[uuid.UUID | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
