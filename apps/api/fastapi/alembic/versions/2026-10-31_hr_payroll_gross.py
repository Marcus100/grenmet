"""Payroll slice 2: gross pay. Dated basic pay and pay item rates, line amounts.

Additive: two new ``hr`` tables, six nullable pricing columns on ``pay_line``,
and BASIC_SALARY added to the pay item method check. Money is integer minor
units (XCD cents). The existing ``pay_line_locked`` trigger also locks the new
columns once a period leaves OPEN.

Revision ID: payrollgross20261031
Revises: payrollinputs20261031
"""

import sqlalchemy as sa

from alembic import op

revision = "payrollgross20261031"
down_revision = "payrollinputs20261031"
branch_labels = None
depends_on = None

OLD_METHODS = (
    "'ATTENDANCE_BASE', 'PUBLIC_HOLIDAY', 'TIME_WINDOW', 'THRESHOLD_EVENT', "
    "'OVERTIME_BAND', 'MANUAL'"
)


def _drop_method_check() -> None:
    # The naming convention decorates CHECK names, so find it by its definition.
    op.execute(
        """
        DO $$
        DECLARE name text;
        BEGIN
          FOR name IN
            SELECT conname FROM pg_constraint
            WHERE conrelid = 'hr.pay_item'::regclass AND contype = 'c'
              AND pg_get_constraintdef(oid) LIKE '%method%'
          LOOP
            EXECUTE format('ALTER TABLE hr.pay_item DROP CONSTRAINT %I', name);
          END LOOP;
        END $$;
        """
    )


def upgrade() -> None:
    _drop_method_check()
    op.create_check_constraint(
        "ck_hr_pay_item_method",
        "pay_item",
        f"method IN ({OLD_METHODS}, 'BASIC_SALARY')",
        schema="hr",
    )
    op.add_column(
        "employee_pay_profile",
        sa.Column("calendar_override_reason", sa.String(length=300), nullable=True),
        schema="hr",
    )
    op.create_table(
        "employee_basic_pay",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("pay_basis", sa.String(length=16), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column(
            "standard_monthly_hours", sa.Numeric(precision=6, scale=2), nullable=False
        ),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("reason", sa.String(length=300), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("amount_minor > 0", name="ck_hr_employee_basic_pay_amount"),
        sa.CheckConstraint(
            "standard_monthly_hours > 0", name="ck_hr_employee_basic_pay_hours"
        ),
        sa.CheckConstraint(
            "effective_to IS NULL OR effective_to >= effective_from",
            name="ck_hr_employee_basic_pay_dates",
        ),
        sa.CheckConstraint(
            "pay_basis IN ('SALARIED', 'HOURLY')", name="ck_hr_employee_basic_pay_basis"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["organisation_id"], ["hr.organisation.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_index(
        "hr_employee_basic_pay_organisation_id_idx",
        "employee_basic_pay",
        ["organisation_id"],
        schema="hr",
    )
    op.create_index(
        "ix_hr_employee_basic_pay_user_from",
        "employee_basic_pay",
        ["user_id", "effective_from"],
        schema="hr",
    )
    op.create_table(
        "pay_item_rate",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("pay_item_id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("rate_kind", sa.String(length=24), nullable=False),
        sa.Column("multiplier", sa.Numeric(precision=6, scale=3), nullable=True),
        sa.Column("amount_minor", sa.BigInteger(), nullable=True),
        sa.Column("guaranteed_hours", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column(
            "guaranteed_multiplier", sa.Numeric(precision=6, scale=3), nullable=True
        ),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("rule_state", sa.String(length=16), nullable=False),
        sa.Column("source_reference", sa.String(length=300), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "(rate_kind = 'HOURLY_MULTIPLIER' AND multiplier IS NOT NULL AND multiplier > 0)"
            " OR (rate_kind = 'FIXED_AMOUNT' AND amount_minor IS NOT NULL AND amount_minor >= 0)",
            name="ck_hr_pay_item_rate_value",
        ),
        sa.CheckConstraint(
            "effective_to IS NULL OR effective_to >= effective_from",
            name="ck_hr_pay_item_rate_dates",
        ),
        sa.CheckConstraint(
            "rate_kind IN ('HOURLY_MULTIPLIER', 'FIXED_AMOUNT')",
            name="ck_hr_pay_item_rate_kind",
        ),
        sa.CheckConstraint(
            "rule_state IN ('PROVISIONAL', 'CONFIRMED')",
            name="ck_hr_pay_item_rate_rule_state",
        ),
        sa.ForeignKeyConstraint(["pay_item_id"], ["hr.pay_item.id"]),
        sa.ForeignKeyConstraint(["organisation_id"], ["hr.organisation.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    op.create_index(
        "hr_pay_item_rate_organisation_id_idx",
        "pay_item_rate",
        ["organisation_id"],
        schema="hr",
    )
    op.create_index(
        "ix_hr_pay_item_rate_item_from",
        "pay_item_rate",
        ["pay_item_id", "effective_from"],
        schema="hr",
    )
    for column in (
        sa.Column("amount_minor", sa.BigInteger(), nullable=True),
        sa.Column("hourly_rate", sa.Numeric(precision=14, scale=4), nullable=True),
        sa.Column("multiplier", sa.Numeric(precision=6, scale=3), nullable=True),
        sa.Column("fixed_amount_minor", sa.BigInteger(), nullable=True),
        sa.Column("pay_item_rate_id", sa.Uuid(), nullable=True),
        sa.Column("basic_pay_id", sa.Uuid(), nullable=True),
    ):
        op.add_column("pay_line", column, schema="hr")
    op.create_foreign_key(
        "pay_line_pay_item_rate_id_fkey",
        "pay_line",
        "pay_item_rate",
        ["pay_item_rate_id"],
        ["id"],
        source_schema="hr",
        referent_schema="hr",
    )
    op.create_foreign_key(
        "pay_line_basic_pay_id_fkey",
        "pay_line",
        "employee_basic_pay",
        ["basic_pay_id"],
        ["id"],
        source_schema="hr",
        referent_schema="hr",
    )


def downgrade() -> None:
    op.drop_constraint("pay_line_basic_pay_id_fkey", "pay_line", schema="hr")
    op.drop_constraint("pay_line_pay_item_rate_id_fkey", "pay_line", schema="hr")
    for name in (
        "basic_pay_id",
        "pay_item_rate_id",
        "fixed_amount_minor",
        "multiplier",
        "hourly_rate",
        "amount_minor",
    ):
        op.drop_column("pay_line", name, schema="hr")
    op.drop_table("pay_item_rate", schema="hr")
    op.drop_table("employee_basic_pay", schema="hr")
    op.drop_column("employee_pay_profile", "calendar_override_reason", schema="hr")
    _drop_method_check()
    op.create_check_constraint(
        "ck_hr_pay_item_method", "pay_item", f"method IN ({OLD_METHODS})", schema="hr"
    )
