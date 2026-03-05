"""add hr profile tables

Revision ID: b41f6fd5ec31
Revises: afe6d53522ad
Create Date: 2026-03-05 15:40:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision = "b41f6fd5ec31"
down_revision = "afe6d53522ad"
branch_labels = None
depends_on = None


user_status_enum = sa.Enum("ACTIVE", "INACTIVE", name="hr_user_status")
employment_type_enum = sa.Enum(
    "FULL_TIME",
    "PART_TIME",
    "CONTRACT",
    "TEMPORARY",
    name="hr_employment_type",
)
employment_status_enum = sa.Enum(
    "ACTIVE",
    "INACTIVE",
    "TERMINATED",
    name="hr_employment_status",
)
shift_pattern_enum = sa.Enum("ROTATION", "FIXED", "FLEX", name="hr_shift_pattern")


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS hr")

    bind = op.get_bind()
    user_status_enum.create(bind, checkfirst=True)
    employment_type_enum.create(bind, checkfirst=True)
    employment_status_enum.create(bind, checkfirst=True)
    shift_pattern_enum.create(bind, checkfirst=True)

    op.create_table(
        "department",
        sa.Column("id", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_index(
        "ix_hr_department_name", "department", ["name"], unique=True, schema="hr"
    )

    op.create_table(
        "user_profile",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("avatar_url", sa.String(length=500), nullable=True),
        sa.Column("status", user_status_enum, nullable=False),
        sa.Column("first_name", sa.String(length=100), nullable=False),
        sa.Column("middle_name", sa.String(length=100), nullable=True),
        sa.Column("last_name", sa.String(length=100), nullable=False),
        sa.Column("display_name", sa.String(length=150), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("nationality", sa.String(length=100), nullable=True),
        sa.Column("gender", sa.String(length=50), nullable=True),
        sa.Column("created_by", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
        schema="hr",
    )
    op.create_index(
        "ix_hr_user_profile_user_id", "user_profile", ["user_id"], schema="hr"
    )

    op.create_table(
        "user_address",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("line_1", sa.String(length=255), nullable=True),
        sa.Column("line_2", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("parish", sa.String(length=100), nullable=True),
        sa.Column("postal_code", sa.String(length=20), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
        schema="hr",
    )
    op.create_index(
        "ix_hr_user_address_user_id", "user_address", ["user_id"], schema="hr"
    )

    op.create_table(
        "employment_record",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("employee_number", sa.String(length=50), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("position", sa.String(length=150), nullable=True),
        sa.Column("employment_type", employment_type_enum, nullable=False),
        sa.Column("start_date", sa.Date(), nullable=True),
        sa.Column("supervisor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("work_location", sa.String(length=255), nullable=True),
        sa.Column("status", employment_status_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.ForeignKeyConstraint(["supervisor_id"], ["user.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_number"),
        sa.UniqueConstraint("user_id"),
        schema="hr",
    )
    op.create_index(
        "ix_hr_employment_record_user_id",
        "employment_record",
        ["user_id"],
        schema="hr",
    )
    op.create_index(
        "ix_hr_employment_record_employee_number",
        "employment_record",
        ["employee_number"],
        schema="hr",
        unique=True,
    )
    op.create_index(
        "ix_hr_employment_record_department_id",
        "employment_record",
        ["department_id"],
        schema="hr",
    )
    op.create_index(
        "ix_hr_employment_record_supervisor_id",
        "employment_record",
        ["supervisor_id"],
        schema="hr",
    )
    op.create_index(
        "ix_hr_employment_record_status",
        "employment_record",
        ["status"],
        schema="hr",
    )

    op.create_table(
        "roster_preference",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("default_shift_pattern", shift_pattern_enum, nullable=False),
        sa.Column("max_night_shifts_per_month", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
        schema="hr",
    )
    op.create_index(
        "ix_hr_roster_preference_user_id",
        "roster_preference",
        ["user_id"],
        schema="hr",
    )

    op.create_table(
        "roster_preferred_shift",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("shift_code", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "shift_code",
            name="uq_hr_roster_preferred_shift_user_id_shift_code",
        ),
        schema="hr",
    )
    op.create_index(
        "ix_hr_roster_preferred_shift_user_id",
        "roster_preferred_shift",
        ["user_id"],
        schema="hr",
    )

    op.create_table(
        "roster_restricted_shift",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("shift_code", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "shift_code",
            name="uq_hr_roster_restricted_shift_user_id_shift_code",
        ),
        schema="hr",
    )
    op.create_index(
        "ix_hr_roster_restricted_shift_user_id",
        "roster_restricted_shift",
        ["user_id"],
        schema="hr",
    )

    op.create_table(
        "leave_balance",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("leave_type", sa.String(length=50), nullable=False),
        sa.Column("balance", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "leave_type", name="uq_hr_leave_balance_user_type"),
        schema="hr",
    )
    op.create_index(
        "ix_hr_leave_balance_user_id", "leave_balance", ["user_id"], schema="hr"
    )

    op.create_table(
        "leave_carry_over",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("leave_type", sa.String(length=50), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id",
            "leave_type",
            name="uq_hr_leave_carry_over_user_type",
        ),
        schema="hr",
    )
    op.create_index(
        "ix_hr_leave_carry_over_user_id",
        "leave_carry_over",
        ["user_id"],
        schema="hr",
    )

    op.create_table(
        "approval_authority",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("can_approve_leave", sa.Boolean(), nullable=False),
        sa.Column("can_approve_shift_swap", sa.Boolean(), nullable=False),
        sa.Column("can_approve_timesheets", sa.Boolean(), nullable=False),
        sa.Column("can_approve_absentee_reports", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id"),
        schema="hr",
    )
    op.create_index(
        "ix_hr_approval_authority_user_id",
        "approval_authority",
        ["user_id"],
        schema="hr",
    )

    op.execute(
        """
        INSERT INTO hr.department (id, name, created_at, updated_at)
        VALUES ('dept_met', 'Meteorological Service', NOW(), NOW())
        ON CONFLICT (id) DO NOTHING
        """
    )


def downgrade() -> None:
    op.drop_index(
        "ix_hr_approval_authority_user_id", table_name="approval_authority", schema="hr"
    )
    op.drop_table("approval_authority", schema="hr")

    op.drop_index("ix_hr_leave_carry_over_user_id", table_name="leave_carry_over", schema="hr")
    op.drop_table("leave_carry_over", schema="hr")

    op.drop_index("ix_hr_leave_balance_user_id", table_name="leave_balance", schema="hr")
    op.drop_table("leave_balance", schema="hr")

    op.drop_index(
        "ix_hr_roster_restricted_shift_user_id",
        table_name="roster_restricted_shift",
        schema="hr",
    )
    op.drop_table("roster_restricted_shift", schema="hr")

    op.drop_index(
        "ix_hr_roster_preferred_shift_user_id",
        table_name="roster_preferred_shift",
        schema="hr",
    )
    op.drop_table("roster_preferred_shift", schema="hr")

    op.drop_index(
        "ix_hr_roster_preference_user_id", table_name="roster_preference", schema="hr"
    )
    op.drop_table("roster_preference", schema="hr")

    op.drop_index(
        "ix_hr_employment_record_status", table_name="employment_record", schema="hr"
    )
    op.drop_index(
        "ix_hr_employment_record_supervisor_id",
        table_name="employment_record",
        schema="hr",
    )
    op.drop_index(
        "ix_hr_employment_record_department_id",
        table_name="employment_record",
        schema="hr",
    )
    op.drop_index(
        "ix_hr_employment_record_employee_number",
        table_name="employment_record",
        schema="hr",
    )
    op.drop_index(
        "ix_hr_employment_record_user_id",
        table_name="employment_record",
        schema="hr",
    )
    op.drop_table("employment_record", schema="hr")

    op.drop_index("ix_hr_user_address_user_id", table_name="user_address", schema="hr")
    op.drop_table("user_address", schema="hr")

    op.drop_index("ix_hr_user_profile_user_id", table_name="user_profile", schema="hr")
    op.drop_table("user_profile", schema="hr")

    op.drop_index("ix_hr_department_name", table_name="department", schema="hr")
    op.drop_table("department", schema="hr")

    bind = op.get_bind()
    shift_pattern_enum.drop(bind, checkfirst=True)
    employment_status_enum.drop(bind, checkfirst=True)
    employment_type_enum.drop(bind, checkfirst=True)
    user_status_enum.drop(bind, checkfirst=True)

    op.execute("DROP SCHEMA IF EXISTS hr")
