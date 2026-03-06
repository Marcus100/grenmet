from sqlmodel import Session, SQLModel, create_engine, select

# Import all models to ensure they're registered with SQLModel
from src.auth.models import User  # noqa: F401
from src.config import settings
from src.hr.models import (  # noqa: F401
    ApprovalAuthority,
    Department,
    EmploymentRecord,
    LeaveBalance,
    LeaveCarryOver,
    RosterPreference,
    RosterPreferredShift,
    RosterRestrictedShift,
    UserAddress,
    UserProfile,
)
from src.hr.absentee.models import AbsenteeReport  # noqa: F401
from src.hr.dailystatus.models import StatusReport, StatusReportEntry  # noqa: F401
from src.hr.exchange.models import ShiftSwapRequest  # noqa: F401
from src.hr.leave.models import LeaveBalanceEvent, LeaveRequest  # noqa: F401
from src.hr.roster.models import (  # noqa: F401
    PublicHoliday,
    RosterAssignment,
    RosterImportJob,
    RosterImportRow,
    RosterPeriod,
    RosterRevision,
    ShiftCatalog,
)
from src.hr.timesheet.models import (  # noqa: F401
    DepartmentPolicy,
    Timesheet,
    TimesheetEntry,
    TimesheetSubmission,
)
from src.hr.workflow.models import (  # noqa: F401
    ApprovalActionLog,
    WorkflowInstance,
    WorkflowStepInstance,
    WorkflowStepTemplate,
    WorkflowTemplate,
)

# Database naming conventions
# This ensures consistent, predictable names for indexes, constraints, etc.
# Following PostgreSQL naming conventions as recommended by best practices
POSTGRES_INDEXES_NAMING_CONVENTION = {
    "ix": "%(column_0_label)s_idx",
    "uq": "%(table_name)s_%(column_0_name)s_key",
    "ck": "%(table_name)s_%(constraint_name)s_check",
    "fk": "%(table_name)s_%(column_0_name)s_fkey",
    "pk": "%(table_name)s_pkey",
}

# Apply naming convention to SQLModel metadata
SQLModel.metadata.naming_convention = POSTGRES_INDEXES_NAMING_CONVENTION

engine = create_engine(str(settings.SQLALCHEMY_DATABASE_URI))


# make sure all SQLModel models are imported before initializing DB
# otherwise, SQLModel might fail to initialize relationships properly
# for more details: https://github.com/fastapi/full-stack-fastapi-template/issues/28


def init_db(session: Session) -> None:
    # Tables should be created with Alembic migrations
    # But if you don't want to use migrations, create
    # the tables un-commenting the next lines
    # from sqlmodel import SQLModel

    # This works because the models are already imported and registered from modules
    # SQLModel.metadata.create_all(engine)

    from src.auth import service
    from src.auth.schemas import UserCreate

    user = session.exec(
        select(User).where(User.email == settings.FIRST_SUPERUSER)
    ).first()
    if not user:
        user_in = UserCreate(
            email=settings.FIRST_SUPERUSER,
            username="admin",
            password=settings.FIRST_SUPERUSER_PASSWORD,
            first_name="Admin",
            last_name="User",
            is_superuser=True,
        )
        user = service.create_user(session=session, user_create=user_in)
