"""Weather tables use separate metadata; main-database Alembic must not see them."""

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Column,
    DateTime,
    Identity,
    Index,
    Integer,
    MetaData,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import registry
from sqlmodel import Field, SQLModel

weather_metadata = MetaData()
weather_registry = registry(metadata=weather_metadata)


class WeatherModel(SQLModel, registry=weather_registry):
    pass


class AuthoredProduct(WeatherModel, table=True):
    __tablename__ = "authored_products"
    __table_args__ = (Index("authored_products_kind_idx", "kind"),)
    id: UUID = Field(primary_key=True)
    kind: str = Field(sa_column=Column(Text, nullable=False))
    draft: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    revision: int
    published: dict[str, Any] | None = Field(
        default=None, sa_column=Column(JSONB(none_as_null=True))
    )
    updated_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=func.now()
        )
    )


class ProductRevision(WeatherModel, table=True):
    __tablename__ = "authored_product_revisions"
    __table_args__ = (
        Index(
            "authored_revisions_product_version_idx",
            "product_id",
            "revision",
            unique=True,
        ),
    )
    id: int | None = Field(
        default=None, sa_column=Column(Integer, Identity(always=True), primary_key=True)
    )
    product_id: UUID = Field(foreign_key="authored_products.id")
    revision: int
    action: str = Field(sa_column=Column(Text, nullable=False))
    content: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    actor_id: str = Field(sa_column=Column(Text, nullable=False))
    actor_name: str = Field(sa_column=Column(Text, nullable=False))
    change_summary: str = Field(sa_column=Column(Text, nullable=False))
    created_at: datetime = Field(
        sa_column=Column(
            DateTime(timezone=True), nullable=False, server_default=func.now()
        )
    )


class AviationDraft(WeatherModel, table=True):
    __tablename__ = "aviation_drafts"
    __table_args__ = (Index("aviation_drafts_station_kind_idx", "station", "kind"),)
    id: UUID = Field(primary_key=True)
    kind: str = Field(sa_column=Column(Text, nullable=False))
    station: str = Field(sa_column=Column(Text, nullable=False))
    content: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    revision: int
    actor_id: str
    actor_name: str
    updated_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )


class AviationDraftRevision(WeatherModel, table=True):
    __tablename__ = "aviation_draft_revisions"
    draft_id: UUID = Field(foreign_key="aviation_drafts.id", primary_key=True)
    revision: int = Field(primary_key=True)
    content: dict[str, Any] = Field(sa_column=Column(JSONB, nullable=False))
    actor_id: str
    actor_name: str
    recorded_at: datetime = Field(
        sa_column=Column(DateTime(timezone=True), nullable=False)
    )
