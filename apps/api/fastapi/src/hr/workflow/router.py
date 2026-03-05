import uuid
from typing import Any

from fastapi import APIRouter

from src.dependencies import CurrentUser, SessionDep

from .schemas import (
    WorkflowActionRequest,
    WorkflowInstanceCreate,
    WorkflowInstanceDetails,
    WorkflowInstancePublic,
    WorkflowStepInstancePublic,
    WorkflowStepTemplateCreate,
    WorkflowStepTemplatePublic,
    WorkflowTemplateCreate,
    WorkflowTemplatePublic,
    WorkflowTemplatesPublic,
)
from .service import (
    apply_workflow_action,
    create_workflow_instance,
    create_workflow_step_template,
    create_workflow_template,
    read_workflow_instance_details,
    read_workflow_templates,
)

router = APIRouter(prefix="/hr/workflows", tags=["hr-workflows"])


@router.post("/templates", response_model=WorkflowTemplatePublic)
def create_template(
    *, session: SessionDep, current_user: CurrentUser, template_in: WorkflowTemplateCreate
) -> Any:
    return create_workflow_template(
        session=session, current_user=current_user, template_in=template_in
    )


@router.get("/templates", response_model=WorkflowTemplatesPublic)
def read_templates(
    session: SessionDep, current_user: CurrentUser, department_id: str | None = None
) -> Any:
    templates = read_workflow_templates(
        session=session, current_user=current_user, department_id=department_id
    )
    return WorkflowTemplatesPublic(
        data=[
            WorkflowTemplatePublic.model_validate(template, from_attributes=True)
            for template in templates
        ],
        count=len(templates),
    )


@router.post("/templates/{template_id}/steps", response_model=WorkflowStepTemplatePublic)
def create_template_step(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    template_id: uuid.UUID,
    step_in: WorkflowStepTemplateCreate,
) -> Any:
    return create_workflow_step_template(
        session=session,
        current_user=current_user,
        workflow_template_id=template_id,
        step_in=step_in,
    )


@router.post("/instances", response_model=WorkflowInstancePublic)
def create_instance(
    *, session: SessionDep, current_user: CurrentUser, instance_in: WorkflowInstanceCreate
) -> Any:
    return create_workflow_instance(
        session=session, current_user=current_user, instance_in=instance_in
    )


@router.get("/instances/{instance_id}", response_model=WorkflowInstanceDetails)
def read_instance(
    session: SessionDep, current_user: CurrentUser, instance_id: uuid.UUID
) -> Any:
    workflow_instance, steps = read_workflow_instance_details(
        session=session, current_user=current_user, workflow_instance_id=instance_id
    )
    return WorkflowInstanceDetails(
        instance=WorkflowInstancePublic.model_validate(
            workflow_instance, from_attributes=True
        ),
        steps=[
            WorkflowStepInstancePublic.model_validate(step, from_attributes=True)
            for step in steps
        ],
    )


@router.post("/instances/{instance_id}/actions", response_model=WorkflowInstancePublic)
def take_action(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    instance_id: uuid.UUID,
    action_in: WorkflowActionRequest,
) -> Any:
    return apply_workflow_action(
        session=session,
        current_user=current_user,
        workflow_instance_id=instance_id,
        action_in=action_in,
    )
