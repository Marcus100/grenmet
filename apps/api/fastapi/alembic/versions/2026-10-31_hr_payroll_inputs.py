"""Payroll inputs, slice 1: pay calendars, periods, items, profiles, runs and lines.

Additive: seven new tables in the ``hr`` schema, one new ``PAYROLL_RUN`` value on
the ``workflowtype`` enum, and a trigger that refuses any write to a pay line
once its period has left OPEN. Quantities only: no rate, amount, tax, NIS or
bank column exists. GAA's provisional pay items are loaded by the seed, not here.

The roster rules lane (#380) also adds a migration; whichever lands second
re-points its ``down_revision`` at the other.

Revision ID: payrollinputs20261031
Revises: refundcheck20261031
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "payrollinputs20261031"
down_revision = "refundcheck20261031"
branch_labels = None
depends_on = None

STATUSES = "('OPEN', 'IN_REVIEW', 'APPROVED', 'EXPORTED', 'CLOSED')"


def _timestamps() -> list[sa.Column]:
    return [
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    ]


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE workflowtype ADD VALUE IF NOT EXISTS 'PAYROLL_RUN'")

    op.create_table(
        "pay_calendar",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("frequency", sa.String(length=16), nullable=False),
        sa.Column("approval_department_id", sa.String(length=100), nullable=False),
        sa.Column("is_default", sa.Boolean(), nullable=False),
        sa.Column("anchor_date", sa.Date(), nullable=True),
        sa.Column("rule_state", sa.String(length=16), nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            "frequency IN ('MONTHLY', 'FORTNIGHTLY')",
            name="ck_hr_pay_calendar_frequency",
        ),
        sa.CheckConstraint(
            "frequency <> 'FORTNIGHTLY' OR anchor_date IS NOT NULL",
            name="ck_hr_pay_calendar_fortnight_anchor",
        ),
        sa.CheckConstraint(
            "rule_state IN ('PROVISIONAL', 'CONFIRMED')",
            name="ck_hr_pay_calendar_rule_state",
        ),
        sa.ForeignKeyConstraint(
            ["approval_department_id", "organisation_id"],
            ["hr.department.id", "hr.department.organisation_id"],
            name="fk_hr_pay_calendar_department_org",
        ),
        sa.ForeignKeyConstraint(["organisation_id"], ["hr.organisation.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organisation_id", "name", name="uq_hr_pay_calendar_org_name"
        ),
        schema="hr",
    )
    op.create_index(
        "hr_pay_calendar_organisation_id_idx",
        "pay_calendar",
        ["organisation_id"],
        schema="hr",
    )
    op.create_index(
        "uq_hr_pay_calendar_org_default",
        "pay_calendar",
        ["organisation_id"],
        unique=True,
        schema="hr",
        postgresql_where=sa.text("is_default"),
    )

    op.create_table(
        "pay_period",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("calendar_id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("workflow_instance_id", sa.Uuid(), nullable=True),
        sa.Column("computed_at", sa.DateTime(), nullable=True),
        sa.Column("submitted_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("exported_at", sa.DateTime(), nullable=True),
        sa.Column("export_count", sa.Integer(), nullable=False),
        sa.Column("closed_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            "end_date >= start_date", name="ck_hr_pay_period_end_not_before_start"
        ),
        sa.CheckConstraint(f"status IN {STATUSES}", name="ck_hr_pay_period_status"),
        sa.ForeignKeyConstraint(["calendar_id"], ["hr.pay_calendar.id"]),
        sa.ForeignKeyConstraint(["organisation_id"], ["hr.organisation.id"]),
        sa.ForeignKeyConstraint(["workflow_instance_id"], ["hr.workflow_instance.id"]),
        sa.ForeignKeyConstraint(["submitted_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "calendar_id", "start_date", name="uq_hr_pay_period_calendar_start"
        ),
        schema="hr",
    )
    op.create_index(
        "hr_pay_period_calendar_id_idx", "pay_period", ["calendar_id"], schema="hr"
    )
    op.create_index(
        "hr_pay_period_organisation_id_idx",
        "pay_period",
        ["organisation_id"],
        schema="hr",
    )

    op.create_table(
        "pay_item",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("unit", sa.String(length=8), nullable=False),
        sa.Column("method", sa.String(length=24), nullable=False),
        sa.Column(
            "params",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("rule_state", sa.String(length=16), nullable=False),
        sa.Column("source_reference", sa.String(length=300), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        *_timestamps(),
        sa.CheckConstraint(
            "effective_to IS NULL OR effective_to >= effective_from",
            name="ck_hr_pay_item_effective_dates",
        ),
        sa.CheckConstraint(
            "kind IN ('BASE_HOURS', 'OVERTIME', 'PUBLIC_HOLIDAY', 'SHIFT_PREMIUM', "
            "'MEAL_ALLOWANCE', 'CALL_OUT', 'OTHER')",
            name="ck_hr_pay_item_kind",
        ),
        sa.CheckConstraint("unit IN ('HOURS', 'COUNT')", name="ck_hr_pay_item_unit"),
        sa.CheckConstraint(
            "method IN ('ATTENDANCE_BASE', 'PUBLIC_HOLIDAY', 'TIME_WINDOW', "
            "'THRESHOLD_EVENT', 'OVERTIME_BAND', 'MANUAL')",
            name="ck_hr_pay_item_method",
        ),
        sa.CheckConstraint(
            "rule_state IN ('PROVISIONAL', 'CONFIRMED')",
            name="ck_hr_pay_item_rule_state",
        ),
        sa.ForeignKeyConstraint(["organisation_id"], ["hr.organisation.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("organisation_id", "code", name="uq_hr_pay_item_org_code"),
        schema="hr",
    )
    op.create_index(
        "hr_pay_item_organisation_id_idx",
        "pay_item",
        ["organisation_id"],
        schema="hr",
    )

    op.create_table(
        "employee_pay_profile",
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("calendar_id", sa.Uuid(), nullable=True),
        sa.Column("shift_worker", sa.Boolean(), nullable=True),
        sa.Column("payroll_reference", sa.String(length=50), nullable=True),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
        *_timestamps(),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["organisation_id"], ["hr.organisation.id"]),
        sa.ForeignKeyConstraint(["calendar_id"], ["hr.pay_calendar.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("user_id"),
        sa.UniqueConstraint(
            "organisation_id",
            "payroll_reference",
            name="uq_hr_employee_pay_profile_org_reference",
        ),
        schema="hr",
    )
    op.create_index(
        "hr_employee_pay_profile_organisation_id_idx",
        "employee_pay_profile",
        ["organisation_id"],
        schema="hr",
    )

    op.create_table(
        "payroll_department_setting",
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("shift_worker_default", sa.Boolean(), nullable=False),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["department_id", "organisation_id"],
            ["hr.department.id", "hr.department.organisation_id"],
            name="fk_hr_payroll_department_setting_department_org",
        ),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("department_id"),
        schema="hr",
    )
    op.create_index(
        "hr_payroll_department_setting_organisation_id_idx",
        "payroll_department_setting",
        ["organisation_id"],
        schema="hr",
    )

    op.create_table(
        "pay_run",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("period_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('REGULAR', 'ADJUSTMENT')", name="ck_hr_pay_run_kind"
        ),
        sa.ForeignKeyConstraint(["period_id"], ["hr.pay_period.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("period_id", "kind", name="uq_hr_pay_run_period_kind"),
        schema="hr",
    )
    op.create_index("hr_pay_run_period_id_idx", "pay_run", ["period_id"], schema="hr")

    op.create_table(
        "pay_line",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("period_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("department_id", sa.String(length=100), nullable=False),
        sa.Column("pay_item_id", sa.Uuid(), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("line_kind", sa.String(length=16), nullable=False),
        sa.Column("source_type", sa.String(length=40), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=True),
        sa.Column("source_revision", sa.Integer(), nullable=True),
        sa.Column("source_key", sa.String(length=200), nullable=False),
        sa.Column("work_date", sa.Date(), nullable=True),
        sa.Column("reason", sa.String(length=500), nullable=True),
        sa.Column("adjusts_period_id", sa.Uuid(), nullable=True),
        sa.Column("adjusts_line_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("quantity <> 0", name="ck_hr_pay_line_quantity_nonzero"),
        sa.CheckConstraint(
            "line_kind IN ('COMPUTED', 'MANUAL', 'REVERSAL', 'REPLACEMENT')",
            name="ck_hr_pay_line_kind",
        ),
        sa.ForeignKeyConstraint(["run_id"], ["hr.pay_run.id"]),
        sa.ForeignKeyConstraint(["period_id"], ["hr.pay_period.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["department_id"], ["hr.department.id"]),
        sa.ForeignKeyConstraint(["pay_item_id"], ["hr.pay_item.id"]),
        sa.ForeignKeyConstraint(["adjusts_period_id"], ["hr.pay_period.id"]),
        sa.ForeignKeyConstraint(["adjusts_line_id"], ["hr.pay_line.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "source_key", name="uq_hr_pay_line_run_source"),
        schema="hr",
    )
    op.create_index("hr_pay_line_run_id_idx", "pay_line", ["run_id"], schema="hr")
    op.create_index("hr_pay_line_user_id_idx", "pay_line", ["user_id"], schema="hr")
    op.create_index(
        "hr_pay_line_pay_item_id_idx", "pay_line", ["pay_item_id"], schema="hr"
    )
    op.create_index(
        "ix_hr_pay_line_period_user", "pay_line", ["period_id", "user_id"], schema="hr"
    )
    op.create_index(
        "ix_hr_pay_line_source", "pay_line", ["source_type", "source_id"], schema="hr"
    )

    # Approved lines are final: no insert, update or delete once the period has
    # left OPEN (IN_REVIEW freezes them too, so the approver sees what is final).
    op.execute(
        """
        CREATE FUNCTION hr.pay_line_is_locked() RETURNS trigger AS $$
        DECLARE
          period_status text;
        BEGIN
          SELECT status INTO period_status FROM hr.pay_period
            WHERE id = COALESCE(NEW.period_id, OLD.period_id);
          IF period_status IS DISTINCT FROM 'OPEN' THEN
            RAISE EXCEPTION 'hr.pay_line: period % is %, lines are locked',
              COALESCE(NEW.period_id, OLD.period_id), period_status;
          END IF;
          IF TG_OP = 'UPDATE' AND NEW.period_id IS DISTINCT FROM OLD.period_id THEN
            RAISE EXCEPTION 'hr.pay_line: a line cannot move between periods';
          END IF;
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER pay_line_locked
          BEFORE INSERT OR UPDATE OR DELETE ON hr.pay_line
          FOR EACH ROW EXECUTE FUNCTION hr.pay_line_is_locked();
        """
    )


def _refuse_if_rows(*tables: str) -> None:
    """Never drop payroll data: downgrade only an empty install."""
    for table in tables:
        query = sa.select(sa.literal(1)).select_from(sa.table(table, schema="hr"))
        if op.get_bind().execute(query.limit(1)).first():
            raise RuntimeError(
                f"hr.{table} has rows; export and remove payroll data before downgrading"
            )


def downgrade() -> None:
    _refuse_if_rows(
        "pay_line",
        "pay_run",
        "pay_period",
        "pay_calendar",
        "employee_pay_profile",
        "payroll_department_setting",
    )  # pay_item holds the seeded catalogue, not payroll data
    op.execute("DROP TRIGGER pay_line_locked ON hr.pay_line")
    op.execute("DROP FUNCTION hr.pay_line_is_locked()")
    op.drop_table("pay_line", schema="hr")
    op.drop_table("pay_run", schema="hr")
    op.drop_table("payroll_department_setting", schema="hr")
    op.drop_table("employee_pay_profile", schema="hr")
    op.drop_table("pay_item", schema="hr")
    op.drop_table("pay_period", schema="hr")
    op.drop_table("pay_calendar", schema="hr")
    # Postgres cannot drop an enum value; the unused PAYROLL_RUN value stays,
    # as for earlier workflowtype additions.
