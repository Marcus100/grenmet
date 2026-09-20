"""Weather tables use separate metadata; main-database Alembic must not see them."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Identity,
    Index,
    Integer,
    MetaData,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

weather_metadata = MetaData()


class WeatherModel(DeclarativeBase):
    """Declarative base for the independently migrated weather database."""

    metadata = weather_metadata


class AuthoredProduct(WeatherModel):
    __tablename__ = "authored_products"
    __table_args__ = (Index("authored_products_kind_idx", "kind"),)
    id: Mapped[UUID] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    draft: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    revision: Mapped[int]
    published: Mapped[dict[str, Any] | None] = mapped_column(
        JSONB(none_as_null=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class ProductRevision(WeatherModel):
    __tablename__ = "authored_product_revisions"
    __table_args__ = (
        Index(
            "authored_revisions_product_version_idx",
            "product_id",
            "revision",
            unique=True,
        ),
    )
    id: Mapped[int] = mapped_column(Integer, Identity(always=True), primary_key=True)
    product_id: Mapped[UUID] = mapped_column(
        ForeignKey("authored_products.id"), nullable=False
    )
    revision: Mapped[int]
    action: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    actor_id: Mapped[str] = mapped_column(Text, nullable=False)
    actor_name: Mapped[str] = mapped_column(Text, nullable=False)
    change_summary: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


class AviationDraft(WeatherModel):
    __tablename__ = "aviation_drafts"
    __table_args__ = (Index("aviation_drafts_station_kind_idx", "station", "kind"),)
    id: Mapped[UUID] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(Text, nullable=False)
    station: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    revision: Mapped[int]
    actor_id: Mapped[str]
    actor_name: Mapped[str]
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )


class AviationDraftRevision(WeatherModel):
    __tablename__ = "aviation_draft_revisions"
    draft_id: Mapped[UUID] = mapped_column(
        ForeignKey("aviation_drafts.id"), primary_key=True
    )
    revision: Mapped[int] = mapped_column(primary_key=True)
    content: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    actor_id: Mapped[str]
    actor_name: Mapped[str]
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
