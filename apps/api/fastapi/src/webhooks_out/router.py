"""Outbound webhook routes (ADR-0029, PF6).

Organisation routes (`/webhooks-out/org/*`) need an owner or admin of an
organisation entitled to the `webhooks` product. Admin routes
(`/webhooks-out/admin/*`) are superuser-only. Routers commit; services flush.
"""

import logging
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Response, status

from src.dependencies import AdminUser, SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations.dependencies import OrgContext, require_org_app
from src.organisations.models import MembershipRole
from src.pagination import PaginationDep
from src.utils import secret_box

from . import delivery, events, service
from .schemas import (
    WebhookAdminDisable,
    WebhookDeliveryList,
    WebhookDeliveryPublic,
    WebhookEndpointCreate,
    WebhookEndpointCreated,
    WebhookEndpointList,
    WebhookEndpointPublic,
    WebhookEndpointUpdate,
    WebhookEventTypeList,
    WebhookEventTypePublic,
    WebhookTestResult,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks-out", tags=["webhooks-out"])

WebhooksOrgAdmin = Annotated[
    OrgContext, Depends(require_org_app(service.PRODUCT, MembershipRole.ADMIN))
]

READ_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND}
WRITE_ERRORS = {
    **AUTHENTICATED,
    **BAD_REQUEST,
    **NOT_FOUND,
    **CONFLICT,
    422: {"description": "The URL, event types or body were rejected"},
}


def _page(
    rows: list[Any], total: int, pagination: Any, model: Any, wrapper: Any
) -> Any:
    return wrapper(
        data=[model.model_validate(row, from_attributes=True) for row in rows],
        count=total,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/org/event-types",
    response_model=WebhookEventTypeList,
    summary="List webhook event types",
    description="Every event an endpoint can subscribe to, with its data schema.",
    operation_id="webhooksOutListEventTypes",
    responses=READ_ERRORS,
)
async def list_event_types(*, org: WebhooksOrgAdmin) -> Any:
    _ = org
    return WebhookEventTypeList(
        data=[
            WebhookEventTypePublic(
                key=event.key,
                description=event.description,
                data_schema=event.schema.model_json_schema(),
            )
            for event in events.CATALOGUE.values()
        ]
    )


@router.post(
    "/org/endpoints",
    response_model=WebhookEndpointCreated,
    status_code=status.HTTP_201_CREATED,
    summary="Register a webhook endpoint",
    description=(
        "https only; the host must resolve to public addresses. The response holds "
        "the signing secret (`whsec_...`) once: store it, it is never shown again."
    ),
    operation_id="webhooksOutCreateEndpoint",
    responses=WRITE_ERRORS,
)
async def create_endpoint(
    *, session: SessionDep, org: WebhooksOrgAdmin, payload: WebhookEndpointCreate
) -> Any:
    endpoint, secret = await service.create_endpoint(
        session, org.user, organisation_id=org.organisation_id, payload=payload
    )
    result = WebhookEndpointCreated.model_validate(
        {
            **WebhookEndpointPublic.model_validate(
                endpoint, from_attributes=True
            ).model_dump(),
            "secret": secret,
        }
    )
    await session.commit()
    return result


@router.get(
    "/org/endpoints",
    response_model=WebhookEndpointList,
    summary="List my webhook endpoints",
    description="Newest first. Never includes signing secrets.",
    operation_id="webhooksOutListEndpoints",
    responses=READ_ERRORS,
)
async def list_endpoints(
    *, session: SessionDep, org: WebhooksOrgAdmin, pagination: PaginationDep
) -> Any:
    rows, total = await service.list_endpoints(
        session,
        organisation_id=org.organisation_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return _page(rows, total, pagination, WebhookEndpointPublic, WebhookEndpointList)


@router.patch(
    "/org/endpoints/{endpoint_id}",
    response_model=WebhookEndpointPublic,
    summary="Update a webhook endpoint",
    description=(
        "Change the URL, description or subscribed events. Setting `status` to "
        "`active` re-enables a disabled endpoint and resets its failure count."
    ),
    operation_id="webhooksOutUpdateEndpoint",
    responses=WRITE_ERRORS,
)
async def update_endpoint(
    *,
    session: SessionDep,
    org: WebhooksOrgAdmin,
    endpoint_id: str,
    payload: WebhookEndpointUpdate,
) -> Any:
    endpoint = await service.update_endpoint(
        session,
        org.user,
        organisation_id=org.organisation_id,
        endpoint_id=endpoint_id,
        payload=payload,
    )
    result = WebhookEndpointPublic.model_validate(endpoint, from_attributes=True)
    await session.commit()
    return result


@router.delete(
    "/org/endpoints/{endpoint_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a webhook endpoint",
    description="Removes the endpoint and its delivery history; queued events are dropped.",
    operation_id="webhooksOutDeleteEndpoint",
    responses=READ_ERRORS,
)
async def delete_endpoint(
    *, session: SessionDep, org: WebhooksOrgAdmin, endpoint_id: str
) -> Response:
    await service.delete_endpoint(
        session, org.user, organisation_id=org.organisation_id, endpoint_id=endpoint_id
    )
    await session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/org/endpoints/{endpoint_id}/rotate-secret",
    response_model=WebhookEndpointCreated,
    summary="Rotate a webhook signing secret",
    description=(
        "Issues a new secret, shown once. The old secret stops signing immediately."
    ),
    operation_id="webhooksOutRotateSecret",
    responses=WRITE_ERRORS,
)
async def rotate_secret(
    *, session: SessionDep, org: WebhooksOrgAdmin, endpoint_id: str
) -> Any:
    endpoint, secret = await service.rotate_secret(
        session, org.user, organisation_id=org.organisation_id, endpoint_id=endpoint_id
    )
    result = WebhookEndpointCreated.model_validate(
        {
            **WebhookEndpointPublic.model_validate(
                endpoint, from_attributes=True
            ).model_dump(),
            "secret": secret,
        }
    )
    await session.commit()
    return result


@router.post(
    "/org/endpoints/{endpoint_id}/test",
    response_model=WebhookTestResult,
    summary="Send a test event",
    description=(
        "Sends a signed `ping` event now and reports the receiver's answer. A "
        "failed test does not count towards automatic disabling."
    ),
    operation_id="webhooksOutTestEndpoint",
    responses=WRITE_ERRORS,
)
async def test_endpoint(
    *, session: SessionDep, org: WebhooksOrgAdmin, endpoint_id: str
) -> Any:
    endpoint = await service.get_endpoint(
        session, organisation_id=org.organisation_id, endpoint_id=endpoint_id
    )
    try:
        secret = service.decrypt_secret(endpoint)
    except secret_box.SecretBoxError:
        return WebhookTestResult(
            delivered=False,
            error="The signing secret cannot be decrypted; rotate it",
            duration_ms=0,
        )
    result, elapsed = await delivery.send_ping(endpoint, secret=secret)
    return WebhookTestResult(
        delivered=result.ok,
        response_status=result.response_status,
        error=result.error,
        duration_ms=elapsed,
    )


@router.get(
    "/org/endpoints/{endpoint_id}/deliveries",
    response_model=WebhookDeliveryList,
    summary="List an endpoint's deliveries",
    description="Delivery history, newest first. Payloads are not kept.",
    operation_id="webhooksOutListDeliveries",
    responses=READ_ERRORS,
)
async def list_deliveries(
    *,
    session: SessionDep,
    org: WebhooksOrgAdmin,
    endpoint_id: str,
    pagination: PaginationDep,
) -> Any:
    rows, total = await service.list_deliveries(
        session,
        organisation_id=org.organisation_id,
        endpoint_id=endpoint_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return _page(rows, total, pagination, WebhookDeliveryPublic, WebhookDeliveryList)


@router.get(
    "/admin/endpoints",
    response_model=WebhookEndpointList,
    summary="List webhook endpoints across organisations",
    description="Superusers only. Optionally filter by organisation.",
    operation_id="webhooksOutAdminListEndpoints",
    responses=READ_ERRORS,
)
async def admin_list_endpoints(
    *,
    session: SessionDep,
    _admin: AdminUser,
    pagination: PaginationDep,
    organisation_id: Annotated[str | None, Query(max_length=100)] = None,
) -> Any:
    rows, total = await service.list_endpoints(
        session,
        organisation_id=organisation_id,
        skip=pagination.skip,
        limit=pagination.limit,
    )
    return _page(rows, total, pagination, WebhookEndpointPublic, WebhookEndpointList)


@router.post(
    "/admin/endpoints/{endpoint_id}/disable",
    response_model=WebhookEndpointPublic,
    summary="Disable a webhook endpoint",
    description="Superusers only. Stops deliveries and emails the organisation's admins.",
    operation_id="webhooksOutAdminDisableEndpoint",
    responses=WRITE_ERRORS,
)
async def admin_disable_endpoint(
    *,
    session: SessionDep,
    admin: AdminUser,
    endpoint_id: str,
    payload: WebhookAdminDisable,
) -> Any:
    from src.audit import service as audit_service

    audit_service.set_actor(session, admin.id)
    endpoint = await service.get_endpoint(
        session, organisation_id=None, endpoint_id=endpoint_id
    )
    await service.disable_endpoint(
        session, endpoint, reason=f"Disabled by a platform admin: {payload.reason}"
    )
    result = WebhookEndpointPublic.model_validate(endpoint, from_attributes=True)
    await session.commit()
    return result
