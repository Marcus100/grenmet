import sys
from typing import Any

from sqlalchemy import create_engine, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from src import db_timeouts

# Import all models so their SQLAlchemy tables are registered before startup.
from src.audit import listener as _audit_listener  # flush hook
from src.audit.models import AuditEntry
from src.auth.models import User
from src.auth.modern_models import AuthChallenge, ExternalIdentity
from src.baseline.models import (
    ApprovalPolicy,
    BaselineAudit,
    BaselineStep,
    StaffCredential,
)
from src.billing import audit as _billing_audit
from src.cap.models import (
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
from src.domains import import_models, run_registrations
from src.eregister import audit as _eregister_audit
from src.events import notifications as _events_notifications
from src.feature_flags import audit as _feature_flags_audit
from src.hr import audit as _hr_audit
from src.hr import notifications as _hr_notifications
from src.hr.absentee.models import AbsenteeReport
from src.hr.dailystatus.models import StatusReport, StatusReportEntry
from src.hr.exchange.models import ShiftSwapRequest
from src.hr.leave.models import LeaveBalanceEvent, LeaveRequest
from src.hr.models import (
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
from src.hr.roster.models import (
    PublicHoliday,
    RosterAssignment,
    RosterImportJob,
    RosterImportRow,
    RosterPeriod,
    RosterRevision,
    ShiftCatalog,
)
from src.hr.signatures.models import SavedSignature, SignedDocument
from src.hr.timesheet.models import (
    DepartmentPolicy,
    Timesheet,
    TimesheetEntry,
    TimesheetSubmission,
)
from src.hr.training.models import TrainingRecord
from src.hr.workflow.models import (
    ApprovalActionLog,
    WorkflowInstance,
    WorkflowStepInstance,
    WorkflowStepTemplate,
    WorkflowTemplate,
)
from src.notifications import gms as _gms_notifications
from src.notifications.models import (
    Notification,
    NotificationDelivery,
    NotificationPreference,
    NotificationSetting,
    NotificationSnooze,
)
from src.organisations import audit as _organisations_audit
from src.rewards import audit as _rewards_audit
from src.stores import audit as _stores_audit
from src.stores import notifications as _stores_notifications
from src.stores.models import (
    Requisition,
    RequisitionLine,
    StockLevel,
    StockMovement,
    StoreItem,
    StoreLocation,
)
from src.wxwatch import alerts as _wxwatch_alerts

# Modules register what they audit and notify about before any session exists.
_hr_audit.register()
_hr_notifications.register()
_wxwatch_alerts.register()
_gms_notifications.register()
_events_notifications.register()
_stores_audit.register()
_stores_notifications.register()
_organisations_audit.register()
_billing_audit.register()
_rewards_audit.register()
_eregister_audit.register()
_feature_flags_audit.register()
# Domains with an ADR-0031 manifest (src/domains.py) register themselves.
import_models()
run_registrations()

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))

# Async engine and session for request path (Phase 2)
_async_url = str(settings.SQLALCHEMY_DATABASE_URI).replace(
    "postgresql+psycopg", "postgresql+asyncpg", 1
)
_async_engine_kwargs: dict[str, Any] = {
    "echo": False,
    # Ends a leaked connection that sits idle inside a transaction (release runbook).
    "connect_args": db_timeouts.idle_in_transaction_connect_args(
        settings.DB_IDLE_IN_TRANSACTION_TIMEOUT
    ),
}


def async_pool_options() -> dict[str, Any]:
    """Pool settings for the main async engine outside tests (see Settings.DB_POOL_*)."""
    return {
        "pool_pre_ping": True,
        "pool_size": settings.DB_POOL_SIZE,
        "max_overflow": settings.DB_MAX_OVERFLOW,
        "pool_timeout": settings.DB_POOL_TIMEOUT,
        "pool_recycle": settings.DB_POOL_RECYCLE,
    }


# pytest creates fresh event loops across tests; disabling async pooling there avoids
# cross-loop asyncpg connection reuse while preserving pooled behavior in the app.
if "pytest" in sys.modules:
    _async_engine_kwargs["poolclass"] = NullPool
else:
    _async_engine_kwargs.update(async_pool_options())

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
