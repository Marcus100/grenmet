import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import ENUM
from sqlalchemy.orm import Mapped, mapped_column

from src.auth.models import RoleAssignmentScope
from src.orm import Base
from src.utils.datetime import utc_now


class WorkflowType(str, Enum):
    LEAVE_REQUEST = "LEAVE_REQUEST"
    SHIFT_SWAP = "SHIFT_SWAP"
    ABSENTEE_REPORT = "ABSENTEE_REPORT"
    STATUS_REPORT = "STATUS_REPORT"
    TIMESHEET = "TIMESHEET"
    PARKING_PERMIT = "PARKING_PERMIT"


class WorkflowStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING = "PENDING"
    RETURNED = "RETURNED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class WorkflowAction(str, Enum):
    SUBMIT = "SUBMIT"
    APPROVE = "APPROVE"
    REJECT = "REJECT"
    RETURN = "RETURN"
    CANCEL = "CANCEL"


class WorkflowTemplate(Base):
    __tablename__ = "workflow_template"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    workflow_type: Mapped[WorkflowType]
    name: Mapped[str] = mapped_column(String(150))
    is_active: Mapped[bool] = mapped_column(default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class WorkflowStepTemplate(Base):
    __tablename__ = "workflow_step_template"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workflow_template_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.workflow_template.id"), index=True
    )
    step_order: Mapped[int]
    required_role_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("role.id"), index=True, nullable=True
    )
    required_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id"), index=True, nullable=True
    )
    required_scope: Mapped[RoleAssignmentScope] = mapped_column(
        ENUM(RoleAssignmentScope, name="roleassignmentscope", create_type=False),
        default=RoleAssignmentScope.SELF,
    )
    is_required: Mapped[bool] = mapped_column(default=True)
    scope_enforced: Mapped[bool] = mapped_column(default=False)
    purpose: Mapped[str] = mapped_column(String(20), default="APPROVAL")
    label: Mapped[str] = mapped_column(String(150), default="Approval")
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class WorkflowInstance(Base):
    __tablename__ = "workflow_instance"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workflow_template_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.workflow_template.id"), index=True
    )
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    workflow_type: Mapped[WorkflowType]
    entity_type: Mapped[str] = mapped_column(String(100))
    entity_id: Mapped[uuid.UUID] = mapped_column(index=True)
    requested_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id"), index=True
    )
    allow_self_approval: Mapped[bool] = mapped_column(default=True)
    require_distinct_approvers: Mapped[bool] = mapped_column(default=False)
    status: Mapped[WorkflowStatus] = mapped_column(default=WorkflowStatus.DRAFT)
    current_step_order: Mapped[int] = mapped_column(default=0)
    submitted_at: Mapped[datetime | None]
    resolved_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class WorkflowStepInstance(Base):
    __tablename__ = "workflow_step_instance"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workflow_instance_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.workflow_instance.id"), index=True
    )
    step_order: Mapped[int]
    required_role_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("role.id"), index=True, nullable=True
    )
    required_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id"), index=True, nullable=True
    )
    required_scope: Mapped[RoleAssignmentScope] = mapped_column(
        ENUM(RoleAssignmentScope, name="roleassignmentscope", create_type=False),
        default=RoleAssignmentScope.SELF,
    )
    is_required: Mapped[bool] = mapped_column(default=True)
    scope_enforced: Mapped[bool] = mapped_column(default=False)
    purpose: Mapped[str] = mapped_column(String(20), default="APPROVAL")
    label: Mapped[str] = mapped_column(String(150), default="Approval")
    approver_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id"), index=True, nullable=True
    )
    action: Mapped[WorkflowAction | None]
    comments: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    acted_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class ApprovalActionLog(Base):
    __tablename__ = "approval_action_log"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    workflow_instance_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.workflow_instance.id"), index=True
    )
    workflow_step_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.workflow_step_instance.id"), index=True, nullable=True
    )
    action: Mapped[WorkflowAction]
    actor_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    comments: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
