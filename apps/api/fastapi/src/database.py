import sys
from typing import Any

from sqlalchemy import create_engine, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

# Import all models so their SQLAlchemy tables are registered before startup.
from src.auth.models import User  # noqa: F401
from src.auth.modern_models import AuthChallenge, ExternalIdentity  # noqa: F401
from src.baseline.models import (  # noqa: F401
    ApprovalPolicy,
    BaselineAudit,
    BaselineStep,
    StaffCredential,
)
from src.cap.models import (  # noqa: F401
    CapAlert,
    CapArea,
    CapAuditEvent,
    CapFeedImport,
    CapHazardType,
    CapIncident,
    CapInfo,
    CapJobEvent,
    CapMqttBroker,
    CapPredefinedArea,
    CapReference,
    CapResource,
    CapSettings,
    CapSnapshot,
    CapWebhook,
)
from src.config import settings
from src.hr.absentee.models import AbsenteeReport  # noqa: F401
from src.hr.dailystatus.models import StatusReport, StatusReportEntry  # noqa: F401
from src.hr.exchange.models import ShiftSwapRequest  # noqa: F401
from src.hr.leave.models import LeaveBalanceEvent, LeaveRequest  # noqa: F401
from src.hr.models import (  # noqa: F401
    ApprovalAuthority,
    Department,
    EmploymentRecord,
    LeaveBalance,
    LeaveCarryOver,
    Organisation,
    RosterPreference,
    RosterPreferredShift,
    RosterRestrictedShift,
    UserAddress,
    UserProfile,
)
from src.hr.roster.models import (  # noqa: F401
    PublicHoliday,
    RosterAssignment,
    RosterImportJob,
    RosterImportRow,
    RosterPeriod,
    RosterRevision,
    ShiftCatalog,
)
from src.hr.signatures.models import SavedSignature, SignedDocument  # noqa: F401
from src.hr.timesheet.models import (  # noqa: F401
    DepartmentPolicy,
    Timesheet,
    TimesheetEntry,
    TimesheetSubmission,
)
from src.hr.training.models import TrainingRecord  # noqa: F401
from src.hr.workflow.models import (  # noqa: F401
    ApprovalActionLog,
    WorkflowInstance,
    WorkflowStepInstance,
    WorkflowStepTemplate,
    WorkflowTemplate,
)

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))

# Async engine and session for request path (Phase 2)
_async_url = str(settings.SQLALCHEMY_DATABASE_URI).replace(
    "postgresql+psycopg", "postgresql+asyncpg", 1
)
_async_engine_kwargs: dict[str, Any] = {"echo": False}

# pytest creates fresh event loops across tests; disabling async pooling there avoids
# cross-loop asyncpg connection reuse while preserving pooled behavior in the app.
if "pytest" in sys.modules:
    _async_engine_kwargs["poolclass"] = NullPool

async_engine = create_async_engine(
    _async_url,
    **_async_engine_kwargs,
)
async_session_factory = async_sessionmaker(
    bind=async_engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


def init_db(session: Session) -> None:
    from src.baseline.organisation_root import seed_organisation

    seed_organisation(session)
    # Tables should be created with Alembic migrations
    # But if you don't want to use migrations, create
    # the tables un-commenting the next lines

    # This works because the models are already imported and registered from modules

    from src.auth import service
    from src.auth.schemas import UserCreate

    user = session.execute(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).scalar_one_or_none()
    if not user:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            username="admin",
            password=settings.FIRST_SUPERUSER_PASSWORD,
            first_name="Admin",
            last_name="User",
            is_superuser=True,
        )
        user = service.create_user_sync(session=session, user_create=user_in)


async def init_db_async(session: AsyncSession) -> None:
    """Ensure initial data exists (e.g. first superuser). For use with async session."""
    from src.auth import service
    from src.auth.schemas import UserCreate
    from src.baseline.organisation_root import seed_organisation_async

    await seed_organisation_async(session)
    result = await session.execute(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    )
    user = result.scalars().first()
    if not user:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            username="admin",
            password=settings.FIRST_SUPERUSER_PASSWORD,
            first_name="Admin",
            last_name="User",
            is_superuser=True,
        )
        await service.create_user(session=session, user_create=user_in)
