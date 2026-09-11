import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import JSON, Column
from sqlmodel import Field, SQLModel

from src.utils.datetime import utc_now


class BaselineStep(SQLModel, table=True):
    __tablename__ = "baseline_step"

    key: str = Field(primary_key=True, max_length=150)
    completed_at: datetime = Field(default_factory=utc_now)


class StaffCredential(SQLModel, table=True):
    __tablename__ = "staff_credential"

    user_id: uuid.UUID = Field(primary_key=True, foreign_key="user.id")
    number: str = Field(
        default_factory=lambda: f"GAA-{uuid.uuid4().hex.upper()}",
        unique=True,
        max_length=36,
    )
    department_id: str = Field(foreign_key="hr.department.id")
    grade_id: str = Field(foreign_key="hr.grade.id")
    revoked_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)


class BaselineAudit(SQLModel, table=True):
    __tablename__ = "baseline_audit"

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    actor_id: uuid.UUID = Field(foreign_key="user.id")
    subject_id: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    action: str = Field(max_length=100)
    details: dict[str, Any] = Field(
        default_factory=dict[str, Any], sa_column=Column(JSON, nullable=False)
    )
    created_at: datetime = Field(default_factory=utc_now)


class ApprovalPolicy(SQLModel, table=True):
    __tablename__ = "approval_policy"

    key: str = Field(primary_key=True, max_length=150)
    allow_self_approval: bool = False
    require_distinct_approvers: bool = True


class ProductAccessPolicy(SQLModel, table=True):
    __tablename__ = "product_access_policy"

    kind: str = Field(primary_key=True, max_length=50)
    grade_ids: list[str] = Field(
        default_factory=list, sa_column=Column(JSON, nullable=False)
    )


class OrganisationUnit(SQLModel, table=True):
    __tablename__ = "organisation_unit"
    id: str = Field(primary_key=True, max_length=100)
    department_id: str = Field(foreign_key="hr.department.id", unique=True)
    parent_id: str | None = Field(default=None, foreign_key="organisation_unit.id")
    source_slide: int


class OrganisationPosition(SQLModel, table=True):
    __tablename__ = "organisation_position"
    id: str = Field(primary_key=True, max_length=120)
    unit_id: str = Field(foreign_key="organisation_unit.id", index=True)
    reports_to_position_id: str | None = Field(
        default=None, foreign_key="organisation_position.id", max_length=120
    )
    additional_connection_id: str | None = Field(
        default=None, foreign_key="organisation_position.id", max_length=120
    )
    grade_code: str = Field(max_length=50)
    title: str = Field(max_length=255)
    authorised_posts: int | None = Field(default=None, ge=0)
    reported_vacancies: int | None = Field(default=None, ge=0)
    source_slide: int
    notes: str = Field(default="", max_length=2000)


class AccessReview(SQLModel, table=True):
    __tablename__ = "access_review"
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    # No assignment FK: the snapshot survives revocation.
    assignment_id: uuid.UUID = Field(index=True)
    subject_id: uuid.UUID = Field(foreign_key="user.id")
    reviewer_id: uuid.UUID = Field(foreign_key="user.id")
    decision: str = Field(max_length=20)
    reason: str = Field(max_length=1000)
    snapshot: dict[str, Any] = Field(sa_column=Column(JSON, nullable=False))
    created_at: datetime = Field(default_factory=utc_now)
