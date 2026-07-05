import uuid

from pydantic import Field

from src.auth.models import RoleAssignmentScope
from src.models import BaseModel, UtcDateTime

from .models import WorkflowAction, WorkflowStatus, WorkflowType


class WorkflowTemplateCreate(BaseModel):
    department_id: str
    workflow_type: WorkflowType
    name: str = Field(min_length=2, max_length=150)


class WorkflowTemplatePublic(BaseModel):
    id: uuid.UUID
    department_id: str
    workflow_type: WorkflowType
    name: str
    is_active: bool
    created_at: UtcDateTime
    updated_at: UtcDateTime


class WorkflowTemplatesPublic(BaseModel):
    data: list[WorkflowTemplatePublic]
    count: int


class WorkflowStepTemplateCreate(BaseModel):
    step_order: int = Field(ge=1)
    required_role_id: uuid.UUID
    required_scope: RoleAssignmentScope = RoleAssignmentScope.SELF
    is_required: bool = True


class WorkflowStepTemplatePublic(BaseModel):
    id: uuid.UUID
    workflow_template_id: uuid.UUID
    step_order: int
    required_role_id: uuid.UUID
    required_scope: RoleAssignmentScope
    is_required: bool
    created_at: UtcDateTime
    updated_at: UtcDateTime


class WorkflowInstanceCreate(BaseModel):
    workflow_template_id: uuid.UUID
    entity_type: str = Field(min_length=2, max_length=100)
    entity_id: uuid.UUID


class WorkflowInstancePublic(BaseModel):
    id: uuid.UUID
    workflow_template_id: uuid.UUID
    department_id: str
    workflow_type: WorkflowType
    entity_type: str
    entity_id: uuid.UUID
    requested_by_user_id: uuid.UUID
    status: WorkflowStatus
    current_step_order: int
    submitted_at: UtcDateTime | None = None
    resolved_at: UtcDateTime | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class WorkflowStepInstancePublic(BaseModel):
    id: uuid.UUID
    workflow_instance_id: uuid.UUID
    step_order: int
    required_role_id: uuid.UUID | None = None
    required_user_id: uuid.UUID | None = None
    required_scope: RoleAssignmentScope
    is_required: bool
    approver_user_id: uuid.UUID | None = None
    action: WorkflowAction | None = None
    comments: str | None = None
    acted_at: UtcDateTime | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class WorkflowActionRequest(BaseModel):
    action: WorkflowAction
    comments: str | None = Field(default=None, max_length=1000)


class WorkflowInstanceDetails(BaseModel):
    instance: WorkflowInstancePublic
    steps: list[WorkflowStepInstancePublic]
