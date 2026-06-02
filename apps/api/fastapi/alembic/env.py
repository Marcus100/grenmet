import asyncio
import selectors
import sys
from logging.config import fileConfig
from pathlib import Path
from typing import Any

from sqlalchemy import pool
from sqlalchemy.engine import Connection
from sqlalchemy.ext.asyncio import async_engine_from_config
from sqlmodel import SQLModel

from alembic import context

# Add the project root to Python path
sys.path.append(str(Path(__file__).parent.parent))

# Import all models to ensure they're registered with SQLModel
from src.auth.models import User  # noqa: F401
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
from src.database import POSTGRES_INDEXES_NAMING_CONVENTION
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

config = context.config
config.set_main_option("sqlalchemy.url", str(settings.SQLALCHEMY_DATABASE_URI))

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

SQLModel.metadata.naming_convention = POSTGRES_INDEXES_NAMING_CONVENTION
target_metadata = SQLModel.metadata

# Schemas tracked by autogenerate. Extend this set when adding a new schema.
_TRACKED_SCHEMAS = {None, "public", "hr", "cap"}


def _include_object(
    object: Any, name: str, type_: str, reflected: bool, compare_to: Any
) -> bool:
    """Include only tables from our tracked schemas; include all other objects."""
    if type_ == "table":
        return getattr(object, "schema", None) in _TRACKED_SCHEMAS
    return True


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        include_schemas=True,
        compare_type=True,
        include_object=_include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        include_schemas=True,
        compare_type=True,
        include_object=_include_object,
    )

    with context.begin_transaction():
        context.run_migrations()


async def run_async_migrations() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


def run_migrations_online() -> None:
    if sys.platform == "win32":
        loop = asyncio.SelectorEventLoop(selectors.SelectSelector())
        try:
            loop.run_until_complete(run_async_migrations())
        finally:
            loop.close()
        return

    asyncio.run(run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
