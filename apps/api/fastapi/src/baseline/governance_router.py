"""GAA organisation, workflow configuration and access reviews."""

import uuid

from fastapi import APIRouter

from src.auth import access
from src.baseline import organisation
from src.dependencies import (
    AdminUser,
    CurrentUser,
    SessionDep,
)
from src.hr.workflow import configuration
from src.hr.workflow.schemas import (
    WorkflowConfigurationInput,
    WorkflowConfigurationPublic,
)

router = APIRouter(
    tags=["governance"],
    responses={
        401: {"description": "Authentication required"},
        403: {"description": "Insufficient access"},
        409: {"description": "Configuration conflict"},
    },
)


@router.get(
    "/auth/access/me",
    response_model=access.EffectiveAccess,
    status_code=200,
    summary="Read effective access",
    description="Read current role permissions. Superuser bypass is explicit; roles are evaluated using current assignment dates.",
)
async def read_effective_access(
    *, session: SessionDep, current_user: CurrentUser
) -> access.EffectiveAccess:
    return await access.current(session, current_user)


@router.get(
    "/auth/access-reviews",
    response_model=access.AccessReviewData,
    status_code=200,
    summary="Review staff access",
    description="Administrators review assignments, permission bundles and historical decisions.",
)
async def read_access_reviews(
    *, session: SessionDep, current_user: AdminUser
) -> access.AccessReviewData:
    return await access.read_reviews(session, current_user)


@router.post(
    "/auth/access-reviews/{assignment_id}",
    response_model=access.ReviewPublic,
    status_code=201,
    summary="Record access review",
    description="Retain or revoke one assignment with a reason and immutable snapshot. Self-review is prohibited.",
)
async def record_access_review(
    *,
    session: SessionDep,
    current_user: AdminUser,
    assignment_id: uuid.UUID,
    body: access.ReviewInput,
) -> access.ReviewPublic:
    return await access.review(session, current_user, assignment_id, body)


@router.get(
    "/hr/setup/organisation",
    response_model=organisation.OrganisationPreview,
    status_code=200,
    summary="Preview GAA organisation seed",
    description="Compare the May 2026 structure with existing data; never change staff or access.",
)
async def preview_organisation(
    *, session: SessionDep, current_user: AdminUser
) -> organisation.OrganisationPreview:
    return await organisation.preview(session, current_user)


@router.post(
    "/hr/setup/organisation",
    response_model=organisation.OrganisationPreview,
    status_code=200,
    summary="Seed missing GAA structure",
    description="Add missing departments, hierarchy and positions atomically. Preserve GMS staff, roster, grades and access.",
)
async def import_organisation(
    *, session: SessionDep, current_user: AdminUser
) -> organisation.OrganisationPreview:
    return await organisation.apply(session, current_user)


@router.get(
    "/hr/setup/workflows",
    response_model=list[WorkflowConfigurationPublic],
    status_code=200,
    summary="Read workflow configuration",
    description="Read active department templates with stage assignees and approval restrictions.",
)
async def read_workflow_configuration(
    *, session: SessionDep, current_user: AdminUser
) -> list[WorkflowConfigurationPublic]:
    return await configuration.read(session, current_user)


@router.put(
    "/hr/setup/workflows/{template_id}",
    response_model=WorkflowConfigurationPublic,
    status_code=200,
    summary="Configure future workflows",
    description="Replace template stages and approval restrictions atomically. Existing instance snapshots are preserved.",
)
async def save_workflow_configuration(
    *,
    session: SessionDep,
    current_user: AdminUser,
    template_id: uuid.UUID,
    body: WorkflowConfigurationInput,
) -> WorkflowConfigurationPublic:
    return await configuration.save(session, current_user, template_id, body)


@router.get(
    "/hr/organisation",
    response_model=organisation.OrganisationCatalogue,
    status_code=200,
    summary="Read GAA position catalogue",
    description="Authenticated reference catalogue of GAA departments and positions; no staff identities or grants.",
)
async def read_organisation_catalogue(
    *, current_user: CurrentUser
) -> organisation.OrganisationCatalogue:
    _ = current_user
    return organisation.CATALOGUE
