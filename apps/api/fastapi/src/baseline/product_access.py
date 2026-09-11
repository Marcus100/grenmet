"""Grade access for authored GMS products. CAP retains independent permissions."""

import logging

from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.auth.models import User
from src.baseline import service
from src.baseline.department import is_gms_department
from src.baseline.models import BaselineAudit, ProductAccessPolicy, StaffCredential
from src.baseline.schemas import ProductAccessInput, ProductAccessPublic
from src.exceptions import AppException
from src.hr.models import EmploymentStatus, Grade

logger = logging.getLogger(__name__)


class ProductPolicyError(AppException):
    """Invalid product kind or grade policy."""

    def __init__(self, message: str):
        super().__init__(message, 400)


PRODUCT_KINDS = (
    "morning",
    "midday",
    "evening",
    "outlook",
    "cyclone",
    "marine",
    "flood",
    "thunderstorm",
    "wind",
    "heat",
    "dust",
    "coastal",
    "tsunami",
)
DEFAULT_GRADES = ("GMS_MANAGER", "GMS_ASSISTANT_MANAGER", "GMS_SENIOR_TECH")


async def policies(session: AsyncSession) -> list[ProductAccessPublic]:
    saved = {
        p.kind: p
        for p in (await session.execute(select(ProductAccessPolicy))).scalars()
    }
    return [
        ProductAccessPublic(
            kind=kind,
            grade_ids=saved[kind].grade_ids if kind in saved else list(DEFAULT_GRADES),
        )
        for kind in PRODUCT_KINDS
    ]


async def save_policy(
    session: AsyncSession, actor: User, kind: str, body: ProductAccessInput
) -> ProductAccessPublic:
    service.require_admin(actor)
    if kind not in PRODUCT_KINDS:
        raise ProductPolicyError("Unknown authored product kind")
    grade_ids = sorted(set(body.grade_ids))
    for grade_id in grade_ids:
        grade = await session.get(Grade, grade_id)
        if (
            not grade
            or not grade.is_active
            or not is_gms_department(grade.department_id)
        ):
            raise ProductPolicyError("Choose active GMS grades")
    policy = await session.get(ProductAccessPolicy, kind)
    if policy is None:
        policy = ProductAccessPolicy(kind=kind)
    policy.grade_ids = grade_ids
    session.add(policy)
    session.add(
        BaselineAudit(
            actor_id=actor.id,
            action="product.access",
            details={"kind": kind, "grade_ids": grade_ids},
        )
    )
    await session.commit()
    logger.info(
        "Product grade policy updated",
        extra={"actor_id": str(actor.id), "kind": kind, "grade_ids": grade_ids},
    )
    return ProductAccessPublic(kind=kind, grade_ids=grade_ids)


async def allowed_kinds(session: AsyncSession, user: User) -> list[str]:
    if not user.is_active or user.registration_pending:
        return []
    if user.is_superuser:
        return list(PRODUCT_KINDS)
    credential = await session.get(StaffCredential, user.id)
    employment = await service.employment_for(session, user.id)
    if (
        credential is None
        or credential.revoked_at is not None
        or employment is None
        or employment.status != EmploymentStatus.ACTIVE
        or not is_gms_department(employment.department_id)
        or not employment.grade_id
    ):
        return []
    grade = await session.get(Grade, employment.grade_id)
    if (
        grade is None
        or not grade.is_active
        or grade.department_id != employment.department_id
        or not is_gms_department(grade.department_id)
    ):
        return []
    return [p.kind for p in await policies(session) if grade.id in p.grade_ids]
