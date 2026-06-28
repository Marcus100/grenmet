"""hr max fidelity gaps

Revision ID: f8d6f0932ffe
Revises: 429042be8687
Create Date: 2026-06-27 21:27:15.671303

Adds form-faithful fields to leave / absentee / dailystatus / timesheet and the
PROFESSIONAL_APPOINTMENT + BEREAVEMENT values on the existing leavetype enum.

Note: autogenerate also surfaced pre-existing CAP-domain drift (cap.* FKs/indexes)
which is intentionally NOT included here — it is unrelated to this change.
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
import sqlmodel


# revision identifiers, used by Alembic.
revision = "f8d6f0932ffe"
down_revision = "429042be8687"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # leavetype enum already exists; add new values (autogenerate misses these).
    op.execute("ALTER TYPE leavetype ADD VALUE IF NOT EXISTS 'PROFESSIONAL_APPOINTMENT'")
    op.execute("ALTER TYPE leavetype ADD VALUE IF NOT EXISTS 'BEREAVEMENT'")

    bind = op.get_bind()
    absence_reason = postgresql.ENUM(
        "UNCERTIFIED_SICK",
        "ILLNESS_FAMILY_MEMBER",
        "ILLNESS_ON_JOB",
        "TIME_OFF",
        "OTHER",
        name="absencereason",
    )
    prof_appointment_type = postgresql.ENUM(
        "BANK", "MEDICAL", "LEGAL", "DENTAL", name="profappointmenttype"
    )
    shift_period = postgresql.ENUM("AM", "PM", name="shiftperiod")
    # add_column does not auto-create new enum types (unlike create_table).
    absence_reason.create(bind, checkfirst=True)
    prof_appointment_type.create(bind, checkfirst=True)
    shift_period.create(bind, checkfirst=True)

    # --- absentee: free-string reason_code -> AbsenceReason enum ---
    op.add_column(
        "absentee_report",
        sa.Column(
            "reason",
            postgresql.ENUM(
                "UNCERTIFIED_SICK",
                "ILLNESS_FAMILY_MEMBER",
                "ILLNESS_ON_JOB",
                "TIME_OFF",
                "OTHER",
                name="absencereason",
                create_type=False,
            ),
            nullable=False,
            server_default="OTHER",
        ),
        schema="hr",
    )
    op.alter_column("absentee_report", "reason", server_default=None, schema="hr")
    op.drop_column("absentee_report", "reason_code", schema="hr")

    # --- leave ---
    op.add_column(
        "leave_request",
        sa.Column(
            "professional_appointment_subtype",
            postgresql.ENUM(
                "BANK",
                "MEDICAL",
                "LEGAL",
                "DENTAL",
                name="profappointmenttype",
                create_type=False,
            ),
            nullable=True,
        ),
        schema="hr",
    )
    op.add_column(
        "leave_request",
        sa.Column("travel_from_date", sa.Date(), nullable=True),
        schema="hr",
    )
    op.add_column(
        "leave_request",
        sa.Column("travel_to_date", sa.Date(), nullable=True),
        schema="hr",
    )
    op.add_column(
        "leave_request",
        sa.Column(
            "salary_in_advance",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="hr",
    )
    op.add_column(
        "leave_request",
        sa.Column(
            "requires_acting_appointment",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="hr",
    )
    op.add_column(
        "leave_request",
        sa.Column("expected_return_date", sa.Date(), nullable=True),
        schema="hr",
    )
    op.alter_column(
        "leave_request", "salary_in_advance", server_default=None, schema="hr"
    )
    op.alter_column(
        "leave_request", "requires_acting_appointment", server_default=None, schema="hr"
    )

    # --- daily status (all nullable, no backfill needed) ---
    op.add_column(
        "status_report",
        sa.Column(
            "shift_period",
            postgresql.ENUM("AM", "PM", name="shiftperiod", create_type=False),
            nullable=True,
        ),
        schema="hr",
    )
    op.add_column(
        "status_report",
        sa.Column("all_personnel_reported_on_time", sa.Boolean(), nullable=True),
        schema="hr",
    )
    op.add_column(
        "status_report",
        sa.Column(
            "personnel_explanation",
            sqlmodel.sql.sqltypes.AutoString(length=1000),
            nullable=True,
        ),
        schema="hr",
    )
    op.add_column(
        "status_report",
        sa.Column("affected_operations", sa.Boolean(), nullable=True),
        schema="hr",
    )
    op.add_column(
        "status_report",
        sa.Column(
            "affected_operations_explanation",
            sqlmodel.sql.sqltypes.AutoString(length=1000),
            nullable=True,
        ),
        schema="hr",
    )
    op.add_column(
        "status_report",
        sa.Column("all_equipment_operational", sa.Boolean(), nullable=True),
        schema="hr",
    )
    op.add_column(
        "status_report",
        sa.Column(
            "equipment_issue_reason",
            sqlmodel.sql.sqltypes.AutoString(length=1000),
            nullable=True,
        ),
        schema="hr",
    )
    op.add_column(
        "status_report",
        sa.Column(
            "equipment_remedy_action",
            sqlmodel.sql.sqltypes.AutoString(length=1000),
            nullable=True,
        ),
        schema="hr",
    )
    op.add_column(
        "status_report",
        sa.Column("incident_reports_submitted", sa.Boolean(), nullable=True),
        schema="hr",
    )
    op.add_column(
        "status_report",
        sa.Column(
            "incident_explanation",
            sqlmodel.sql.sqltypes.AutoString(length=1000),
            nullable=True,
        ),
        schema="hr",
    )

    # --- timesheet entry (NOT NULL numerics/bool need a default for existing rows) ---
    op.add_column(
        "timesheet_entry",
        sa.Column(
            "total_hours",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        schema="hr",
    )
    op.add_column(
        "timesheet_entry",
        sa.Column(
            "hours_worked",
            sa.Numeric(precision=5, scale=2),
            nullable=False,
            server_default=sa.text("0"),
        ),
        schema="hr",
    )
    op.add_column(
        "timesheet_entry",
        sa.Column(
            "medical_certificate_attached",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="hr",
    )
    op.alter_column("timesheet_entry", "total_hours", server_default=None, schema="hr")
    op.alter_column("timesheet_entry", "hours_worked", server_default=None, schema="hr")
    op.alter_column(
        "timesheet_entry",
        "medical_certificate_attached",
        server_default=None,
        schema="hr",
    )


def downgrade() -> None:
    op.drop_column("timesheet_entry", "medical_certificate_attached", schema="hr")
    op.drop_column("timesheet_entry", "hours_worked", schema="hr")
    op.drop_column("timesheet_entry", "total_hours", schema="hr")

    op.drop_column("status_report", "incident_explanation", schema="hr")
    op.drop_column("status_report", "incident_reports_submitted", schema="hr")
    op.drop_column("status_report", "equipment_remedy_action", schema="hr")
    op.drop_column("status_report", "equipment_issue_reason", schema="hr")
    op.drop_column("status_report", "all_equipment_operational", schema="hr")
    op.drop_column("status_report", "affected_operations_explanation", schema="hr")
    op.drop_column("status_report", "affected_operations", schema="hr")
    op.drop_column("status_report", "personnel_explanation", schema="hr")
    op.drop_column("status_report", "all_personnel_reported_on_time", schema="hr")
    op.drop_column("status_report", "shift_period", schema="hr")

    op.drop_column("leave_request", "expected_return_date", schema="hr")
    op.drop_column("leave_request", "requires_acting_appointment", schema="hr")
    op.drop_column("leave_request", "salary_in_advance", schema="hr")
    op.drop_column("leave_request", "travel_to_date", schema="hr")
    op.drop_column("leave_request", "travel_from_date", schema="hr")
    op.drop_column("leave_request", "professional_appointment_subtype", schema="hr")

    op.add_column(
        "absentee_report",
        sa.Column(
            "reason_code",
            sa.VARCHAR(length=60),
            nullable=False,
            server_default="OTHER",
        ),
        schema="hr",
    )
    op.alter_column("absentee_report", "reason_code", server_default=None, schema="hr")
    op.drop_column("absentee_report", "reason", schema="hr")

    # Drop enum types created in this revision.
    op.execute("DROP TYPE IF EXISTS shiftperiod")
    op.execute("DROP TYPE IF EXISTS profappointmenttype")
    op.execute("DROP TYPE IF EXISTS absencereason")
    # Note: PROFESSIONAL_APPOINTMENT/BEREAVEMENT values on leavetype are not
    # removed — PostgreSQL does not support removing enum values.
