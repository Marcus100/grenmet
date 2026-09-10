"""Live effective access and audited reviews. Reviews do not infer grants from titles."""

import logging
import uuid

from sqlalchemy import delete, exists
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import col, select

from src.auth.models import Role, User, UserRoleAssignment, UserRoleLink
from src.auth.policy import _active_assignments
from src.auth.schemas import AccessReviewData as AccessReviewData
from src.auth.schemas import EffectiveAccess as EffectiveAccess
from src.auth.schemas import ReviewAssignment as ReviewAssignment
from src.auth.schemas import ReviewInput as ReviewInput
from src.auth.schemas import ReviewPublic as ReviewPublic
from src.baseline.models import AccessReview
from src.baseline.service import require_admin
from src.exceptions import AppException


async def effective_roles(session: AsyncSession, user: User) -> list[Role]:
    active = await _active_assignments(session=session, user_id=user.id)
    ids = {a.role_id for a in active}
    # Preserve legacy grants only where there has never been a scoped assignment.
    legacy = await session.execute(
        select(UserRoleLink.role_id).where(
            col(UserRoleLink.user_id) == user.id,
            ~exists(
                select(UserRoleAssignment.id).where(
                    col(UserRoleAssignment.user_id) == user.id,
                    col(UserRoleAssignment.role_id) == UserRoleLink.role_id,
                )
            ),
        )
    )
    ids.update(legacy.scalars().all())
    if not ids:
        return []
    return list(
        (
            await session.execute(
                select(Role)
                .where(col(Role.id).in_(ids))
                .options(selectinload(Role.permissions))  # type: ignore[arg-type]
            )
        )
        .scalars()
        .all()
    )


async def current(session: AsyncSession, user: User) -> EffectiveAccess:
    roles = await effective_roles(session, user)
    return EffectiveAccess(
        is_superuser=user.is_superuser,
        role_names=sorted(r.name for r in roles),
        permission_keys=sorted({p.key for r in roles for p in r.permissions}),
    )


async def read_reviews(session: AsyncSession, actor: User) -> AccessReviewData:
    require_admin(actor)
    rows = (
        await session.execute(
            select(UserRoleAssignment, User, Role)
            .join(User, col(User.id) == UserRoleAssignment.user_id)
            .join(Role, col(Role.id) == UserRoleAssignment.role_id)
            .options(selectinload(Role.permissions))  # type: ignore[arg-type]
            .order_by(User.last_name, Role.name)
        )
    ).all()
    reviews = (
        (
            await session.execute(
                select(AccessReview).order_by(col(AccessReview.created_at).desc())
            )
        )
        .scalars()
        .all()
    )
    admins = (
        (await session.execute(select(User).where(col(User.is_superuser).is_(True))))
        .scalars()
        .all()
    )
    assignments = [
        ReviewAssignment(
            id=a.id,
            user_id=u.id,
            name=u.full_name,
            role=r.name,
            scope=a.scope.value,
            department_id=a.department_id,
            effective_from=a.effective_from,
            effective_to=a.effective_to,
            is_superuser=u.is_superuser,
            permissions=sorted(p.key for p in r.permissions),
        )
        for a, u, r in rows
    ]
    legacy_rows = (
        await session.execute(
            select(UserRoleLink, User, Role)
            .join(User, col(User.id) == UserRoleLink.user_id)
            .join(Role, col(Role.id) == UserRoleLink.role_id)
            .where(
                ~exists(
                    select(UserRoleAssignment.id).where(
                        col(UserRoleAssignment.user_id) == UserRoleLink.user_id,
                        col(UserRoleAssignment.role_id) == UserRoleLink.role_id,
                    )
                )
            )
            .options(selectinload(Role.permissions))  # type: ignore[arg-type]
        )
    ).all()
    for link, user, role in legacy_rows:
        assignments.append(
            ReviewAssignment(
                id=uuid.uuid5(
                    uuid.NAMESPACE_URL, f"gaa-legacy:{link.user_id}:{link.role_id}"
                ),
                user_id=user.id,
                name=user.full_name,
                role=role.name,
                scope="LEGACY (unscoped)",
                department_id=None,
                effective_from=user.created_at,
                effective_to=None,
                is_superuser=user.is_superuser,
                permissions=sorted(p.key for p in role.permissions),
            )
        )
    return AccessReviewData(
        assignments=assignments,
        reviews=[ReviewPublic.model_validate(r, from_attributes=True) for r in reviews],
        superusers=[u.username for u in admins],
    )


async def review(
    session: AsyncSession, actor: User, assignment_id: uuid.UUID, body: ReviewInput
) -> ReviewPublic:
    require_admin(actor)
    assignment = (
        (
            await session.execute(
                select(UserRoleAssignment)
                .where(UserRoleAssignment.id == assignment_id)
                .with_for_update()
            )
        )
        .scalars()
        .first()
    )
    if assignment is None:
        return await review_legacy(session, actor, assignment_id, body)
    if assignment.user_id == actor.id:
        raise AppException("Another administrator must review your access", 403)
    reason = body.reason.strip()
    if len(reason) < 5:
        raise AppException("Provide a meaningful review reason", 422)
    role = (
        (
            await session.execute(
                select(Role)
                .where(Role.id == assignment.role_id)
                .options(selectinload(Role.permissions))  # type: ignore[arg-type]
            )
        )
        .scalars()
        .first()
    )
    record = AccessReview(
        assignment_id=assignment.id,
        subject_id=assignment.user_id,
        reviewer_id=actor.id,
        decision=body.decision,
        reason=reason,
        snapshot={
            **assignment.model_dump(mode="json"),
            "role_name": role.name if role else None,
            "permission_keys": sorted(p.key for p in role.permissions) if role else [],
        },
    )
    session.add(record)
    if body.decision == "REVOKE":
        await session.delete(assignment)
        await session.flush()
        remaining = (
            await session.execute(
                select(UserRoleAssignment.id).where(
                    col(UserRoleAssignment.user_id) == assignment.user_id,
                    col(UserRoleAssignment.role_id) == assignment.role_id,
                )
            )
        ).first()
        if remaining is None:
            await session.execute(
                delete(UserRoleLink).where(
                    col(UserRoleLink.user_id) == assignment.user_id,
                    col(UserRoleLink.role_id) == assignment.role_id,
                )
            )
    await session.commit()
    logging.getLogger(__name__).info("access.review", extra={"actor_id": str(actor.id)})
    await session.refresh(record)
    return ReviewPublic.model_validate(record, from_attributes=True)


async def review_legacy(
    session: AsyncSession, actor: User, assignment_id: uuid.UUID, body: ReviewInput
) -> ReviewPublic:
    require_admin(actor)
    links = (
        (
            await session.execute(
                select(UserRoleLink)
                .where(
                    ~exists(
                        select(UserRoleAssignment.id).where(
                            col(UserRoleAssignment.user_id) == UserRoleLink.user_id,
                            col(UserRoleAssignment.role_id) == UserRoleLink.role_id,
                        )
                    )
                )
                .with_for_update()
            )
        )
        .scalars()
        .all()
    )
    link = next(
        (
            item
            for item in links
            if uuid.uuid5(
                uuid.NAMESPACE_URL, f"gaa-legacy:{item.user_id}:{item.role_id}"
            )
            == assignment_id
        ),
        None,
    )
    if link is None:
        raise AppException("Assignment no longer exists; refresh the review", 409)
    if link.user_id == actor.id:
        raise AppException("Another administrator must review your access", 403)
    if len(body.reason.strip()) < 5:
        raise AppException("Provide a meaningful review reason", 422)
    role = (
        (
            await session.execute(
                select(Role)
                .where(Role.id == link.role_id)
                .options(selectinload(Role.permissions))  # type: ignore[arg-type]
            )
        )
        .scalars()
        .first()
    )
    record = AccessReview(
        assignment_id=assignment_id,
        subject_id=link.user_id,
        reviewer_id=actor.id,
        decision=body.decision,
        reason=body.reason.strip(),
        snapshot={
            "legacy": True,
            "role_id": str(link.role_id),
            "role_name": role.name if role else None,
            "permission_keys": sorted(p.key for p in role.permissions) if role else [],
            "user_id": str(link.user_id),
        },
    )
    session.add(record)
    if body.decision == "REVOKE":
        await session.delete(link)
    await session.commit()
    await session.refresh(record)
    logging.getLogger(__name__).info(
        "access.review.legacy",
        extra={"actor_id": str(actor.id), "subject_id": str(record.subject_id)},
    )
    return ReviewPublic.model_validate(record, from_attributes=True)
