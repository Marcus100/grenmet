import uuid
from datetime import datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from src.auth.models import RoleAssignmentScope


class WorkflowType(str, Enum):
    LEAVE_REQUEST = "LEAVE_REQUEST"
    SHIFT_SWAP = "SHIFT_SWAP"
    ABSENTEE_REPORT = "ABSENTEE_REPORT"
    STATUS_REPORT = "STATUS_REPORT"
    TIMESHEET = "TIMESHEET"


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


class WorkflowTemplate(SQLModel, table=True):
    __tablename__ = "workflow_template"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    workflow_type: WorkflowType
    name: str = Field(max_length=150)
    is_active: bool = True
    created_by: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class WorkflowStepTemplate(SQLModel, table=True):
    __tablename__ = "workflow_step_template"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workflow_template_id: uuid.UUID = Field(foreign_key="hr.workflow_template.id", index=True)
    step_order: int = Field(ge=1)
    required_role_id: uuid.UUID = Field(foreign_key="role.id", index=True)
    required_scope: RoleAssignmentScope = Field(default=RoleAssignmentScope.SELF)
    is_required: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class WorkflowInstance(SQLModel, table=True):
    __tablename__ = "workflow_instance"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workflow_template_id: uuid.UUID = Field(foreign_key="hr.workflow_template.id", index=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    workflow_type: WorkflowType
    entity_type: str = Field(max_length=100)
    entity_id: uuid.UUID = Field(index=True)
    requested_by_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    status: WorkflowStatus = Field(default=WorkflowStatus.DRAFT)
    current_step_order: int = Field(default=0)
    submitted_at: datetime | None = None
    resolved_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class WorkflowStepInstance(SQLModel, table=True):
    __tablename__ = "workflow_step_instance"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workflow_instance_id: uuid.UUID = Field(foreign_key="hr.workflow_instance.id", index=True)
    step_order: int = Field(ge=1)
    required_role_id: uuid.UUID = Field(foreign_key="role.id", index=True)
    required_scope: RoleAssignmentScope = Field(default=RoleAssignmentScope.SELF)
    is_required: bool = True
    approver_user_id: uuid.UUID | None = Field(default=None, foreign_key="user.id", index=True)
    action: WorkflowAction | None = None
    comments: str | None = Field(default=None, max_length=1000)
    acted_at: datetime | None = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class ApprovalActionLog(SQLModel, table=True):
    __tablename__ = "approval_action_log"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    workflow_instance_id: uuid.UUID = Field(foreign_key="hr.workflow_instance.id", index=True)
    workflow_step_instance_id: uuid.UUID | None = Field(
        default=None, foreign_key="hr.workflow_step_instance.id", index=True
    )
    action: WorkflowAction
    actor_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    comments: str | None = Field(default=None, max_length=1000)
    created_at: datetime = Field(default_factory=datetime.utcnow)
