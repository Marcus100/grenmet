from typing import Any

from fastapi import APIRouter, status

from src.dependencies import CurrentUser, SessionDep
from src.hr.dependencies import WorkflowInstanceDep, WorkflowTemplateDep

from . import service
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

router = APIRouter(prefix="/hr/workflows", tags=["hr-workflows"])


@router.post(
    "/templates",
    response_model=WorkflowTemplatePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create workflow template",
    description="Create a new workflow template. Requires workflow.template.manage permission.",
    responses={
        status.HTTP_200_OK: {"description": "Template created"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def create_template(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    template_in: WorkflowTemplateCreate,
) -> Any:
    return await service.create_workflow_template(
        session=session, current_user=current_user, template_in=template_in
    )


@router.get(
    "/templates",
    response_model=WorkflowTemplatesPublic,
    summary="List workflow templates",
    description="List workflow templates, optionally filtered by department_id. Requires workflow.template.view permission.",
    responses={
        status.HTTP_200_OK: {"description": "Templates returned"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def read_templates(
    session: SessionDep, current_user: CurrentUser, department_id: str | None = None
) -> Any:
    templates = await service.read_workflow_templates(
        session=session, current_user=current_user, department_id=department_id
    )
    return WorkflowTemplatesPublic(
        data=[
            WorkflowTemplatePublic.model_validate(template, from_attributes=True)
            for template in templates
        ],
        count=len(templates),
    )


@router.post(
    "/templates/{template_id}/steps",
    response_model=WorkflowStepTemplatePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add step to workflow template",
    description="Create a step template for a workflow template. Requires workflow.template.manage permission.",
    responses={
        status.HTTP_200_OK: {"description": "Step created"},
        status.HTTP_404_NOT_FOUND: {"description": "Workflow template not found"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def create_template_step(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    _template: WorkflowTemplateDep,
    step_in: WorkflowStepTemplateCreate,
) -> Any:
    return await service.create_workflow_step_template(
        session=session,
        current_user=current_user,
        workflow_template_id=_template.id,
        step_in=step_in,
    )


@router.post(
    "/instances",
    response_model=WorkflowInstancePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create workflow instance",
    description="Create a new workflow instance from a template. Template must exist.",
    responses={
        status.HTTP_200_OK: {"description": "Instance created"},
        status.HTTP_404_NOT_FOUND: {"description": "Workflow template not found"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def create_instance(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    instance_in: WorkflowInstanceCreate,
) -> Any:
    return await service.create_workflow_instance(
        session=session, current_user=current_user, instance_in=instance_in
    )


@router.get(
    "/instances/{instance_id}",
    response_model=WorkflowInstanceDetails,
    summary="Get workflow instance details",
    description="Return a workflow instance and its step instances. Requires workflow.instance.view permission.",
    responses={
        status.HTTP_200_OK: {"description": "Instance and steps returned"},
        status.HTTP_404_NOT_FOUND: {"description": "Workflow instance not found"},
        status.HTTP_403_FORBIDDEN: {"description": "Insufficient permission"},
    },
)
async def read_instance(
    session: SessionDep,
    current_user: CurrentUser,
    workflow_instance: WorkflowInstanceDep,
) -> Any:
    instance, steps = await service.read_workflow_instance_details(
        session=session,
        current_user=current_user,
        workflow_instance_id=workflow_instance.id,
    )
    return WorkflowInstanceDetails(
        instance=WorkflowInstancePublic.model_validate(instance, from_attributes=True),
        steps=[
            WorkflowStepInstancePublic.model_validate(step, from_attributes=True)
            for step in steps
        ],
    )


@router.post(
    "/instances/{instance_id}/actions",
    response_model=WorkflowInstancePublic,
    summary="Perform workflow action",
    description="Submit, approve, reject, return, or cancel a workflow instance. Requires workflow.instance.action and step-level role. May return 400 if workflow state does not allow the action.",
    responses={
        status.HTTP_200_OK: {"description": "Action applied"},
        status.HTTP_400_BAD_REQUEST: {
            "description": "Workflow cannot be submitted or is not pending"
        },
        status.HTTP_404_NOT_FOUND: {
            "description": "Workflow instance or step not found"
        },
        status.HTTP_403_FORBIDDEN: {
            "description": "Not allowed to perform this workflow action"
        },
    },
)
async def take_action(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    workflow_instance: WorkflowInstanceDep,
    action_in: WorkflowActionRequest,
) -> Any:
    return await service.apply_workflow_action(
        session=session,
        current_user=current_user,
        workflow_instance_id=workflow_instance.id,
        action_in=action_in,
    )
