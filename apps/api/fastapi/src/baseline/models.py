import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class BaselineStep(Base):
    __tablename__ = "baseline_step"

    key: Mapped[str] = mapped_column(String(150), primary_key=True)
    completed_at: Mapped[datetime] = mapped_column(default=utc_now)


class StaffCredential(Base):
    __tablename__ = "staff_credential"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), primary_key=True)
    number: Mapped[str] = mapped_column(
        String(36), unique=True, default=lambda: f"GAA-{uuid.uuid4().hex.upper()}"
    )
    department_id: Mapped[str] = mapped_column(ForeignKey("hr.department.id"))
    grade_id: Mapped[str] = mapped_column(ForeignKey("hr.grade.id"))
    revoked_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class BaselineAudit(Base):
    __tablename__ = "baseline_audit"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    actor_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    subject_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id"), nullable=True
    )
    action: Mapped[str] = mapped_column(String(100))
    details: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class ApprovalPolicy(Base):
    __tablename__ = "approval_policy"

    key: Mapped[str] = mapped_column(String(150), primary_key=True)
    allow_self_approval: Mapped[bool] = mapped_column(default=False)
    require_distinct_approvers: Mapped[bool] = mapped_column(default=True)


class ProductAccessPolicy(Base):
    __tablename__ = "product_access_policy"

    kind: Mapped[str] = mapped_column(String(50), primary_key=True)
    grade_ids: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)


class OrganisationUnit(Base):
    __tablename__ = "organisation_unit"

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), unique=True
    )
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("organisation_unit.id"), nullable=True
    )
    source_slide: Mapped[int]


class OrganisationPosition(Base):
    __tablename__ = "organisation_position"

    id: Mapped[str] = mapped_column(String(120), primary_key=True)
    unit_id: Mapped[str] = mapped_column(ForeignKey("organisation_unit.id"), index=True)
    reports_to_position_id: Mapped[str | None] = mapped_column(
        String(120), ForeignKey("organisation_position.id"), nullable=True
    )
    additional_connection_id: Mapped[str | None] = mapped_column(
        String(120), ForeignKey("organisation_position.id"), nullable=True
    )
    grade_code: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(255))
    authorised_posts: Mapped[int | None]
    reported_vacancies: Mapped[int | None]
    source_slide: Mapped[int]
    notes: Mapped[str] = mapped_column(String(2000), default="")


class AccessReview(Base):
    __tablename__ = "access_review"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    assignment_id: Mapped[uuid.UUID] = mapped_column(index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    reviewer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    decision: Mapped[str] = mapped_column(String(20))
    reason: Mapped[str] = mapped_column(String(1000))
    snapshot: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
