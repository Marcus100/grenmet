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
