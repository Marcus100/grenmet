"""Weather tables use separate metadata; main-database Alembic must not see them."""

from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import (
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Identity,
    Index,
    Integer,
    MetaData,
    Numeric,
    SmallInteger,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB
from sqlalchemy.dialects.postgresql import UUID as PgUUID
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


class TropicalSystem(WeatherModel):
    """GMS identity of one tropical system across outlook issues (migration 0003)."""

    __tablename__ = "tropical_systems"
    __table_args__ = (
        UniqueConstraint(
            "season", "sequence", name="tropical_systems_season_sequence_key"
        ),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True)
    season: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    sequence: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    feature_type: Mapped[str] = mapped_column(Text, nullable=False)
    nhc_storm_id: Mapped[str | None] = mapped_column(Text)
    nhc_invest_id: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="active")
    closed_reason: Mapped[str | None] = mapped_column(Text)
    continued_as_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("tropical_systems.id")
    )
    first_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_issued_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    created_by: Mapped[str] = mapped_column(Text, nullable=False)
    updated_by: Mapped[str] = mapped_column(Text, nullable=False)

    @property
    def label(self) -> str:
        return f"GMS {self.season}-{self.sequence:02d}"


class TropicalSystemEntry(WeatherModel):
    """One system in one outlook revision; derived and rebuildable from revisions."""

    __tablename__ = "tropical_system_entries"
    __table_args__ = (
        ForeignKeyConstraint(
            ["product_id", "revision"],
            [
                "authored_product_revisions.product_id",
                "authored_product_revisions.revision",
            ],
            name="tropical_system_entries_revision_fk",
        ),
        UniqueConstraint(
            "product_id",
            "revision",
            "system_id",
            name="tropical_system_entries_revision_system_key",
        ),
        Index("tropical_system_entries_system_issued_idx", "system_id", "issued_at"),
    )
    id: Mapped[int] = mapped_column(Integer, Identity(always=True), primary_key=True)
    system_id: Mapped[UUID] = mapped_column(
        ForeignKey("tropical_systems.id"), nullable=False
    )
    product_id: Mapped[UUID] = mapped_column(nullable=False)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    action: Mapped[str] = mapped_column(Text, nullable=False)
    issued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)
    feature_type: Mapped[str] = mapped_column(Text, nullable=False)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(6, 2))
    movement_direction: Mapped[str | None] = mapped_column(Text)
    movement_speed_kt: Mapped[Decimal | None] = mapped_column(Numeric(5, 1))
    formation_48h: Mapped[int | None] = mapped_column(SmallInteger)
    formation_7d: Mapped[int | None] = mapped_column(SmallInteger)
    # Logical links into WxWatch editions; no cross-database foreign key.
    source_edition_ids: Mapped[list[UUID]] = mapped_column(
        ARRAY(PgUUID(as_uuid=True)), nullable=False, default=list
    )
