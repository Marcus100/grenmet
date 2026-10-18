"""Stores tables (main database, ``stores`` schema).

Everything is scoped to an organisation; requisitions also carry the
requester's department. Quantities are whole units.
"""

import uuid
from datetime import date, datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.orm import Base
from src.utils.datetime import utc_now


class MovementKind(str, Enum):
    RECEIPT = "RECEIPT"
    ISSUE = "ISSUE"
    ADJUSTMENT = "ADJUSTMENT"


class RequisitionStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    PARTIALLY_DELIVERED = "PARTIALLY_DELIVERED"
    DELIVERED = "DELIVERED"
    CANCELLED = "CANCELLED"


def _enum(enum_class: type[Enum]) -> sa.Enum:
    return sa.Enum(enum_class, native_enum=False, length=20, create_constraint=False)


class StoreLocation(Base):
    """A physical store room that holds stock."""

    __tablename__ = "store_location"
    __table_args__ = (
        sa.UniqueConstraint(
            "organisation_id", "code", name="uq_stores_store_location_org_code"
        ),
        {"schema": "stores"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    code: Mapped[str] = mapped_column(String(40))
    name: Mapped[str] = mapped_column(String(150))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class StoreItem(Base):
    """Catalogue entry; retired with ``is_active`` rather than deleted."""

    __tablename__ = "item"
    __table_args__ = (
        sa.UniqueConstraint("organisation_id", "sku", name="uq_stores_item_org_sku"),
        {"schema": "stores"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    sku: Mapped[str] = mapped_column(String(60))
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(100))
    unit: Mapped[str] = mapped_column(String(30))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class StockLevel(Base):
    """On-hand quantity of one item at one location. Never negative."""

    __tablename__ = "stock_level"
    __table_args__ = (
        sa.CheckConstraint("quantity >= 0", name="ck_stores_stock_level_quantity"),
        {"schema": "stores"},
    )

    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stores.item.id"), primary_key=True
    )
    location_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stores.store_location.id"), primary_key=True
    )
    quantity: Mapped[int] = mapped_column(default=0)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class StockMovement(Base):
    """Append-only ledger of every change to a stock level."""

    __tablename__ = "stock_movement"
    __table_args__ = (
        sa.CheckConstraint(
            "quantity_delta <> 0", name="ck_stores_stock_movement_delta"
        ),
        sa.CheckConstraint(
            "balance_after >= 0", name="ck_stores_stock_movement_balance"
        ),
        sa.Index("ix_stores_stock_movement_item_created", "item_id", "created_at"),
        {"schema": "stores"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stores.item.id"))
    location_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stores.store_location.id"), index=True
    )
    kind: Mapped[MovementKind] = mapped_column(_enum(MovementKind))
    quantity_delta: Mapped[int]
    balance_after: Mapped[int]
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    requisition_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("stores.requisition.id"), nullable=True, index=True
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class Requisition(Base):
    """A department request for supplies from the stores."""

    __tablename__ = "requisition"
    __table_args__ = (
        sa.Index("ix_stores_requisition_org_status", "organisation_id", "status"),
        sa.ForeignKeyConstraint(
            ["department_id", "organisation_id"],
            ["hr.department.id", "hr.department.organisation_id"],
            name="fk_stores_requisition_department_org",
        ),
        {"schema": "stores"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    number: Mapped[int] = mapped_column(sa.Integer, sa.Identity(), unique=True)
    organisation_id: Mapped[str] = mapped_column(String(100), index=True)
    department_id: Mapped[str] = mapped_column(String(100), index=True)
    requester_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id"), index=True
    )
    status: Mapped[RequisitionStatus] = mapped_column(
        _enum(RequisitionStatus), default=RequisitionStatus.DRAFT
    )
    purpose: Mapped[str | None] = mapped_column(String(500), nullable=True)
    needed_by: Mapped[date | None]
    submitted_at: Mapped[datetime | None]
    decided_at: Mapped[datetime | None]
    decided_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id"), nullable=True
    )
    decision_note: Mapped[str | None] = mapped_column(String(500), nullable=True)
    delivered_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)

    lines: Mapped[list[RequisitionLine]] = relationship(
        back_populates="requisition",
        cascade="all, delete-orphan",
        order_by="RequisitionLine.position",
        lazy="selectin",
    )


class RequisitionLine(Base):
    __tablename__ = "requisition_line"
    __table_args__ = (
        sa.UniqueConstraint(
            "requisition_id", "item_id", name="uq_stores_requisition_line_item"
        ),
        sa.CheckConstraint(
            "requested_quantity > 0", name="ck_stores_requisition_line_requested"
        ),
        sa.CheckConstraint(
            "approved_quantity IS NULL OR "
            "(approved_quantity >= 0 AND approved_quantity <= requested_quantity)",
            name="ck_stores_requisition_line_approved",
        ),
        sa.CheckConstraint(
            "delivered_quantity >= 0 AND delivered_quantity <= "
            "COALESCE(approved_quantity, 0)",
            name="ck_stores_requisition_line_delivered",
        ),
        {"schema": "stores"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    requisition_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("stores.requisition.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("stores.item.id"))
    position: Mapped[int] = mapped_column(default=0)
    requested_quantity: Mapped[int]
    approved_quantity: Mapped[int | None]
    delivered_quantity: Mapped[int] = mapped_column(default=0)

    requisition: Mapped[Requisition] = relationship(back_populates="lines")
    item: Mapped[StoreItem] = relationship(lazy="joined")
