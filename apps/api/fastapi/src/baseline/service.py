import uuid
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import col, delete, select

from src.auth.models import Permission, Role, User, UserImage, UserRoleAssignment
from src.auth.models import Session as LoginSession
from src.baseline.models import ApprovalPolicy, BaselineAudit, StaffCredential
from src.baseline.schemas import (
    BalanceInput,
    GradeInput,
    PolicyInput,
    RoleConfiguration,
    RolePermissionsInput,
    StaffCard,
    StaffInput,
    StaffSetup,
)
from src.exceptions import AppException
from src.hr.leave.models import LeaveBalanceEvent
from src.hr.models import Department, EmploymentRecord, EmploymentStatus, Grade
from src.hr.organisations import department_for
from src.utils.datetime import utc_now


def employment_complete(employment: EmploymentRecord | None) -> bool:
    return bool(
        employment
        and employment.status == EmploymentStatus.ACTIVE
        and employment.employee_number
        and employment.employment_type
        and employment.start_date
    )


def require_admin(user: User) -> None:
    if not user.is_superuser:
        raise AppException("Administrator access required", 403)


async def employment_for(
    session: AsyncSession, user_id: uuid.UUID
) -> EmploymentRecord | None:
    return (
        (
            await session.execute(
                select(EmploymentRecord).where(EmploymentRecord.user_id == user_id)
            )
        )
        .scalars()
        .first()
    )


async def card_for(session: AsyncSession, user: User) -> StaffCard:
    credential = await session.get(StaffCredential, user.id)
    if credential is None:
        raise AppException("No staff credential has been issued", 404)
    employment = await employment_for(session, user.id)
    department = await session.get(
        Department, employment.department_id if employment else credential.department_id
    )
    grade = await session.get(
        Grade,
        employment.grade_id
        if employment and employment.grade_id
        else credential.grade_id,
    )
    photo = (
        (await session.execute(select(UserImage).where(UserImage.user_id == user.id)))
        .scalars()
        .first()
    )
    photo_url = None
    if photo:
        if photo.object_key.startswith("/"):
            photo_url = photo.object_key
        else:
            from src.storage.service import StorageNotConfiguredError, storage_service

            try:
                photo_url = storage_service.presigned_download_url(photo.object_key)
            except StorageNotConfiguredError:
                photo_url = None
    status = "pending"
    if credential.revoked_at or (
        employment and employment.status != EmploymentStatus.ACTIVE
    ):
        status = "inactive"
    elif (
        user.is_active
        and user.email_verified_at
        and not user.registration_pending
        and employment
        and employment.status == EmploymentStatus.ACTIVE
        and department
        and grade
    ):
        status = "active"
    return StaffCard(
        email_verified=user.email_verified_at is not None,
        account_approved=not user.registration_pending,
        employment_ready=employment_complete(employment),
        issued_at=credential.created_at,
        user_id=user.id,
        number=credential.number,
        name=" ".join(
            filter(None, [user.first_name, user.middle_name, user.last_name])
        ),
        department=department.name if department else "",
        grade=grade.label if grade else "",
        photo=photo_url,
        status=status,
    )


async def list_staff(session: AsyncSession) -> list[StaffSetup]:
    rows = (
        await session.execute(
            select(StaffCredential, User)
            .select_from(User)
            .outerjoin(StaffCredential, col(StaffCredential.user_id) == User.id)
            .where(User.username != "admin")
        )
    ).all()
    result = []
    for credential, user in rows:
        employment = await employment_for(session, user.id)
        result.append(
            StaffSetup(
                registration_pending=user.registration_pending,
                user_id=user.id,
                email=user.email,
                name=user.full_name,
                number=credential.number if credential else "",
                department_id=employment.department_id
                if employment
                else credential.department_id
                if credential
                else "",
                grade_id=employment.grade_id
                if employment and employment.grade_id
                else credential.grade_id
                if credential
                else "",
                mailbox_ready=user.is_active,
                email_verified=user.email_verified_at is not None,
                employment_ready=employment_complete(employment),
                employee_number=employment.employee_number if employment else None,
                employment_type=employment.employment_type if employment else None,
                start_date=employment.start_date if employment else None,
                supervisor_id=employment.supervisor_id if employment else None,
                status="inactive"
                if credential and credential.revoked_at
                else "ready"
                if employment_complete(employment)
                else "draft",
            )
        )
    return result


async def save_staff(
    session: AsyncSession, actor: User, user_id: uuid.UUID, body: StaffInput
) -> None:
    require_admin(actor)
    user = (
        (
            await session.execute(
                select(User).where(User.id == user_id).with_for_update()
            )
        )
        .scalars()
        .first()
    )
    if not user:
        raise AppException("User not found", 404)
    grade = await session.get(Grade, body.grade_id)
    if not grade or not grade.is_active or grade.department_id != body.department_id:
        raise AppException("Choose an active grade in this department", 400)
    credential = await session.get(StaffCredential, user_id)
    if credential and credential.revoked_at:
        raise AppException(
            "Offboarded credentials cannot be reactivated through onboarding", 409
        )
    if not credential:
        credential = StaffCredential(
            user_id=user_id, department_id=body.department_id, grade_id=body.grade_id
        )
    credential.department_id, credential.grade_id = body.department_id, body.grade_id
    session.add(credential)
    employment = await employment_for(session, user_id)
    department = await department_for(session, body.department_id)
    if employment and employment.organisation_id != department.organisation_id:
        raise AppException(
            "Cross-organisation employment transfers are not supported", 400
        )
    if employment is None:
        employment = EmploymentRecord(
            user_id=user_id,
            department_id=body.department_id,
            organisation_id=department.organisation_id,
        )
    if body.supervisor_id:
        supervisor = await employment_for(session, body.supervisor_id)
        if (
            body.supervisor_id == user_id
            or not supervisor
            or supervisor.department_id != body.department_id
            or supervisor.status != EmploymentStatus.ACTIVE
        ):
            raise AppException(
                "Supervisor must be another active employee in the department", 400
            )
    employment.department_id = body.department_id
    employment.grade_id = body.grade_id
    employment.position = grade.label
    employment.supervisor_id = body.supervisor_id
    employment.updated_at = utc_now()
    # Save verified fields independently; workflow readiness still requires all three.
    for field in ("employee_number", "employment_type", "start_date"):
        value = getattr(body, field)
        if value is not None:
            setattr(employment, field, value)
    session.add(employment)
    if body.mailbox_ready and not user.is_active:
        user.email_verification_required = True
    user.is_active = body.mailbox_ready
    session.add(user)
    if not user.is_active:
        await session.execute(
            delete(LoginSession).where(col(LoginSession.user_id) == user_id)
        )
    session.add(
        BaselineAudit(
            actor_id=actor.id,
            subject_id=user_id,
            action="staff.setup",
            details=body.model_dump(mode="json"),
        )
    )
    await session.commit()


async def save_grade(
    session: AsyncSession, actor: User, grade_id: str, body: GradeInput
) -> Grade:
    require_admin(actor)
    if not await session.get(Department, body.department_id):
        raise AppException("Department not found", 404)
    grade = await session.get(Grade, grade_id)
    if grade and grade.department_id != body.department_id:
        raise AppException("A grade cannot be moved between departments", 400)
    if grade is None:
        grade = Grade(id=grade_id, **body.model_dump())
    else:
        grade.sqlmodel_update(body.model_dump())
        grade.updated_at = utc_now()
    session.add(grade)
    session.add(
        BaselineAudit(
            actor_id=actor.id,
            action="grade.update",
            details={"id": grade_id, **body.model_dump()},
        )
    )
    await session.commit()
    await session.refresh(grade)
    return grade


async def set_balance(
    session: AsyncSession, actor: User, user_id: uuid.UUID, body: BalanceInput
) -> None:
    require_admin(actor)
    user = (
        (
            await session.execute(
                select(User).where(User.id == user_id).with_for_update()
            )
        )
        .scalars()
        .first()
    )
    if not user or not await employment_for(session, user_id):
        raise AppException("Complete employment setup first", 400)
    last = (
        (
            await session.execute(
                select(LeaveBalanceEvent)
                .where(
                    LeaveBalanceEvent.user_id == user_id,
                    LeaveBalanceEvent.leave_type == body.leave_type.value,
                )
                .order_by(col(LeaveBalanceEvent.created_at).desc())
                .limit(1)
            )
        )
        .scalars()
        .first()
    )
    previous = last.balance_after_days if last else Decimal(0)
    session.add(
        LeaveBalanceEvent(
            user_id=user_id,
            leave_type=body.leave_type.value,
            delta_days=body.balance - previous,
            balance_after_days=body.balance,
            reason=body.reason,
            created_by_user_id=actor.id,
        )
    )
    session.add(
        BaselineAudit(
            actor_id=actor.id,
            subject_id=user_id,
            action="leave.balance",
            details=body.model_dump(mode="json"),
        )
    )
    await session.commit()


async def offboard(session: AsyncSession, actor: User, user_id: uuid.UUID) -> None:
    require_admin(actor)
    if actor.id == user_id:
        raise AppException("Another administrator must offboard you", 400)
    user = await session.get(User, user_id)
    credential = await session.get(StaffCredential, user_id)
    if not user or not credential:
        raise AppException("Staff credential not found", 404)
    user.is_active = False
    credential.revoked_at = utc_now()
    employment = await employment_for(session, user_id)
    if employment:
        employment.status = EmploymentStatus.TERMINATED
        session.add(employment)
    await session.execute(
        delete(LoginSession).where(col(LoginSession.user_id) == user_id)
    )
    await session.execute(
        delete(UserRoleAssignment).where(col(UserRoleAssignment.user_id) == user_id)
    )
    from sqlmodel import SQLModel

    link = SQLModel.metadata.tables["user_role"]
    await session.execute(delete(link).where(link.c.user_id == user_id))
    session.add(user)
    session.add(credential)
    session.add(
        BaselineAudit(
            actor_id=actor.id,
            subject_id=user_id,
            action="staff.offboard",
            details={"external_accounts_require_verification": ["SURFACE", "wis2box"]},
        )
    )
    await session.commit()


async def require_ready(
    session: AsyncSession, user_id: uuid.UUID, department_id: str
) -> None:
    credential = await session.get(StaffCredential, user_id)
    if credential is None:
        raise AppException("Complete staff onboarding before using HR workflows", 409)
    employment = await employment_for(session, user_id)
    grade = (
        await session.get(Grade, employment.grade_id)
        if employment and employment.grade_id
        else None
    )
    if (
        grade is None
        or not grade.is_active
        or grade.department_id != department_id
        or credential.revoked_at
        or not employment
        or not employment_complete(employment)
        or employment.status != EmploymentStatus.ACTIVE
        or employment.department_id != department_id
    ):
        raise AppException(
            "Complete active employment setup in this department before using HR workflows",
            409,
        )


async def require_leave_ready(
    session: AsyncSession, user_id: uuid.UUID, department_id: str, leave_type: str
) -> None:
    await require_ready(session, user_id, department_id)
    if await session.get(StaffCredential, user_id):
        entry = (
            (
                await session.execute(
                    select(LeaveBalanceEvent).where(
                        LeaveBalanceEvent.user_id == user_id,
                        LeaveBalanceEvent.leave_type == leave_type,
                    )
                )
            )
            .scalars()
            .first()
        )
        if entry is None:
            raise AppException(
                "Verify the opening balance for this leave type before submission", 409
            )


async def read_setup_grades(
    *, session: AsyncSession, current_user: User
) -> list[Grade]:
    require_admin(current_user)
    return list(
        (await session.execute(select(Grade).order_by(col(Grade.rank)))).scalars().all()
    )


async def read_setup_policies(
    *, session: AsyncSession, current_user: User
) -> list[ApprovalPolicy]:
    require_admin(current_user)
    return list((await session.execute(select(ApprovalPolicy))).scalars().all())


async def update_setup_policy(
    *, session: AsyncSession, current_user: User, key: str, body: PolicyInput
) -> ApprovalPolicy:
    from src.exceptions import AppException

    policy = await session.get(ApprovalPolicy, key)
    if policy is None:
        raise AppException("Policy not found", 404)
    policy.sqlmodel_update(body.model_dump())
    session.add(policy)
    session.add(
        BaselineAudit(
            actor_id=current_user.id,
            action="approval.policy",
            details={"key": key, **body.model_dump()},
        )
    )
    await session.commit()
    await session.refresh(policy)
    return policy


async def read_role_configuration(
    *, session: AsyncSession, current_user: User
) -> list[RoleConfiguration]:
    require_admin(current_user)
    roles = (
        (
            await session.execute(
                select(Role).options(
                    selectinload(Role.permissions)  # type: ignore[arg-type]
                )
            )
        )
        .scalars()
        .all()
    )
    return [
        RoleConfiguration(
            id=role.id,
            name=role.name,
            permission_keys=[p.key for p in role.permissions if p.key],
        )
        for role in roles
    ]


async def update_role_configuration(
    *,
    session: AsyncSession,
    current_user: User,
    role_id: uuid.UUID,
    body: RolePermissionsInput,
) -> RoleConfiguration:
    from src.exceptions import AppException

    role = (
        (
            await session.execute(
                select(Role)
                .where(Role.id == role_id)
                .options(
                    selectinload(Role.permissions)  # type: ignore[arg-type]
                )
                .with_for_update()
            )
        )
        .scalars()
        .first()
    )
    if not role:
        raise AppException("Role not found", 404)
    permissions = (await session.execute(select(Permission))).scalars().all()
    selected = [p for p in permissions if p.key in body.permission_keys]
    if {p.key for p in selected} != set(body.permission_keys):
        raise AppException("Unknown permission key", 400)
    role.permissions = selected
    session.add(role)
    session.add(
        BaselineAudit(
            actor_id=current_user.id,
            action="role.permissions",
            details={"role_id": str(role_id), **body.model_dump()},
        )
    )
    await session.commit()
    return RoleConfiguration(
        id=role.id, name=role.name, permission_keys=body.permission_keys
    )


async def approve_registration(
    session: AsyncSession, actor: User, user_id: uuid.UUID
) -> None:
    require_admin(actor)
    from src.auth.models import RoleAssignmentScope, UserRoleLink

    user = (
        (
            await session.execute(
                select(User).where(User.id == user_id).with_for_update()
            )
        )
        .scalars()
        .first()
    )
    if user is None:
        raise AppException("User not found", 404)
    if not user.registration_pending:
        raise AppException("This registration has already been resolved", 409)
    employment = await employment_for(session, user_id)
    credential = await session.get(StaffCredential, user_id)
    if not user.is_active or not user.email_verified_at:
        raise AppException(
            "The account must be active and its email verified before approval", 409
        )
    grade = (
        await session.get(Grade, employment.grade_id)
        if employment and employment.grade_id
        else None
    )
    if (
        grade is None
        or not grade.is_active
        or not employment
        or grade.department_id != employment.department_id
        or employment.status != EmploymentStatus.ACTIVE
        or not credential
        or credential.revoked_at
    ):
        raise AppException(
            "Save an active department and grade in staff setup before approval", 409
        )
    role = (
        (await session.execute(select(Role).where(Role.name == "staff")))
        .scalars()
        .first()
    )
    if role is None:
        raise AppException(
            "Configure the staff role before approving registrations", 409
        )
    if await session.get(UserRoleLink, (user_id, role.id)) is None:
        session.add(UserRoleLink(user_id=user_id, role_id=role.id))
    assignment = (
        (
            await session.execute(
                select(UserRoleAssignment).where(
                    UserRoleAssignment.user_id == user_id,
                    UserRoleAssignment.role_id == role.id,
                    UserRoleAssignment.organisation_id == employment.organisation_id,
                    UserRoleAssignment.scope == RoleAssignmentScope.SELF,
                )
            )
        )
        .scalars()
        .first()
    )
    if assignment is None:
        session.add(
            UserRoleAssignment(
                user_id=user_id,
                role_id=role.id,
                scope=RoleAssignmentScope.SELF,
                organisation_id=employment.organisation_id,
            )
        )
    user.registration_pending = False
    session.add(user)
    session.add(
        BaselineAudit(
            actor_id=actor.id,
            subject_id=user_id,
            action="registration.approved",
            details={
                "department_id": employment.department_id,
                "grade_id": employment.grade_id,
            },
        )
    )
    await session.commit()
