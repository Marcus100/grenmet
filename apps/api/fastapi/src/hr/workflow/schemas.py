import uuid
from typing import Literal, Self

from pydantic import Field, model_validator

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
    required_role_id: uuid.UUID | None = None
    required_user_id: uuid.UUID | None = None
    required_scope: RoleAssignmentScope = RoleAssignmentScope.SELF
    is_required: bool = True
    scope_enforced: bool = True
    purpose: Literal["APPROVAL", "REVIEW", "RECORDING"] = "APPROVAL"
    label: str = Field(default="Approval", min_length=1, max_length=150)

    @model_validator(mode="after")
    def validate_assignee(self) -> Self:
        if (self.required_role_id is None) == (self.required_user_id is None):
            raise ValueError("Choose exactly one role or named person")
        return self


class WorkflowStepTemplatePublic(BaseModel):
    id: uuid.UUID
    workflow_template_id: uuid.UUID
    step_order: int
    required_role_id: uuid.UUID | None = None
    required_user_id: uuid.UUID | None = None
    required_scope: RoleAssignmentScope
    is_required: bool
    scope_enforced: bool = True
    purpose: Literal["APPROVAL", "REVIEW", "RECORDING"] = "APPROVAL"
    label: str = "Approval"
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
    scope_enforced: bool = True
    purpose: Literal["APPROVAL", "REVIEW", "RECORDING"] = "APPROVAL"
    label: str = "Approval"
    approver_user_id: uuid.UUID | None = None
    action: WorkflowAction | None = None
    comments: str | None = None
    acted_at: UtcDateTime | None = None
    created_at: UtcDateTime
    updated_at: UtcDateTime


class WorkflowActionRequest(BaseModel):
    step_id: uuid.UUID | None = None
    action: WorkflowAction
    comments: str | None = Field(default=None, max_length=1000)


class WorkflowInstanceDetails(BaseModel):
    instance: WorkflowInstancePublic
    steps: list[WorkflowStepInstancePublic]


class WorkflowInboxItem(BaseModel):
    instance_id: uuid.UUID
    workflow_type: WorkflowType
    entity_type: str
    entity_id: uuid.UUID
    department_id: str
    requested_by_user_id: uuid.UUID
    requester_name: str | None = None
    submitted_at: UtcDateTime | None = None
    current_step_order: int
    # True when the current user is a named co-approver; False when they qualify
    # through a role (supervisor/management tier).
    step_is_named: bool
    step_id: uuid.UUID | None = None
    is_required: bool = True
    purpose: str = "APPROVAL"
    label: str = "Approval"


class WorkflowInboxList(BaseModel):
    data: list[WorkflowInboxItem]
    count: int


class WorkflowConfigurationInput(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    allow_self_approval: bool = False
    require_distinct_approvers: bool = True
    steps: list[WorkflowStepTemplateCreate] = Field(min_length=1, max_length=30)

    @model_validator(mode="after")
    def validate_steps(self) -> Self:
        orders = [step.step_order for step in self.steps]
        if sorted(orders) != list(range(1, len(orders) + 1)):
            raise ValueError(
                "Stages must have unique consecutive order numbers starting at 1"
            )
        if not any(
            step.is_required and step.purpose != "RECORDING" for step in self.steps
        ):
            raise ValueError("At least one blocking approval or review is required")
        return self


class WorkflowConfigurationPublic(BaseModel):
    template: WorkflowTemplatePublic
    allow_self_approval: bool
    require_distinct_approvers: bool
    steps: list[WorkflowStepTemplatePublic]
