"""Payroll slice 3: income tax, social insurance and other deductions.

Additive: six new ``hr`` tables and two nullable issue-approval columns on
``pay_period``. ``pay_deduction_line`` is locked by the same function as
``pay_line``: no write once its period has left OPEN.

Revision ID: payrolldeductions20261031
Revises: payrollgross20261031
"""

import sqlalchemy as sa

from alembic import op

revision = "payrolldeductions20261031"
down_revision = "payrollgross20261031"
branch_labels = None
depends_on = None

STATES = "('PROVISIONAL', 'OWNER_CONFIRMED', 'CONFIRMED')"


def _dated(prefix: str) -> sa.CheckConstraint:
    return sa.CheckConstraint(
        "effective_to IS NULL OR effective_to >= effective_from",
        name=f"ck_hr_{prefix}_dates",
    )


def _org() -> list[sa.SchemaItem]:
    return [
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.ForeignKeyConstraint(["organisation_id"], ["hr.organisation.id"]),
    ]


def _index(table: str) -> None:
    op.create_index(
        f"hr_{table}_organisation_id_idx", table, ["organisation_id"], schema="hr"
    )


def _common() -> list[sa.Column]:
    return [
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("rule_state", sa.String(length=16), nullable=False),
        sa.Column("source_note", sa.String(length=500), nullable=True),
        sa.Column(
            "created_by_user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=True
        ),
        sa.Column(
            "confirmed_by_user_id", sa.Uuid(), sa.ForeignKey("user.id"), nullable=True
        ),
        sa.Column("confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("confirmation_note", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    ]


def upgrade() -> None:
    op.add_column(
        "pay_period",
        sa.Column("issue_approved_at", sa.DateTime(), nullable=True),
        schema="hr",
    )
    op.add_column(
        "pay_period",
        sa.Column("issue_approved_by_user_id", sa.Uuid(), nullable=True),
        schema="hr",
    )
    op.create_foreign_key(
        "pay_period_issue_approved_by_user_id_fkey",
        "pay_period",
        "user",
        ["issue_approved_by_user_id"],
        ["id"],
        source_schema="hr",
    )
    op.create_table(
        "tax_table",
        sa.Column("id", sa.Uuid(), nullable=False),
        *_org(),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("method", sa.String(length=24), nullable=False),
        sa.Column("annual_allowance_minor", sa.BigInteger(), nullable=False),
        sa.Column("deduct_social_insurance", sa.Boolean(), nullable=False),
        *_common(),
        _dated("tax_table"),
        sa.CheckConstraint("method IN ('ANNUALISED')", name="ck_hr_tax_table_method"),
        sa.CheckConstraint(
            f"rule_state IN {STATES}", name="ck_hr_tax_table_rule_state"
        ),
        sa.CheckConstraint(
            "annual_allowance_minor >= 0", name="ck_hr_tax_table_allowance"
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    _index("tax_table")
    op.create_table(
        "tax_band",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("tax_table_id", sa.Uuid(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("width_minor", sa.BigInteger(), nullable=True),
        sa.Column("rate", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.CheckConstraint("rate >= 0 AND rate <= 1", name="ck_hr_tax_band_rate"),
        sa.ForeignKeyConstraint(
            ["tax_table_id"], ["hr.tax_table.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tax_table_id", "sort_order", name="uq_hr_tax_band_order"),
        schema="hr",
    )
    op.create_index(
        "hr_tax_band_tax_table_id_idx", "tax_band", ["tax_table_id"], schema="hr"
    )
    op.create_table(
        "social_insurance_scheme",
        sa.Column("id", sa.Uuid(), nullable=False),
        *_org(),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("employee_rate", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("employer_rate", sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column("monthly_ceiling_minor", sa.BigInteger(), nullable=False),
        sa.Column("weekly_ceiling_minor", sa.BigInteger(), nullable=False),
        sa.Column("fortnightly_ceiling_minor", sa.BigInteger(), nullable=True),
        *_common(),
        _dated("social_insurance_scheme"),
        sa.CheckConstraint(
            f"rule_state IN {STATES}", name="ck_hr_social_insurance_scheme_rule_state"
        ),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    _index("social_insurance_scheme")
    op.create_table(
        "deduction_type",
        sa.Column("id", sa.Uuid(), nullable=False),
        *_org(),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("kind", sa.String(length=24), nullable=False),
        sa.Column("employee_rate", sa.Numeric(precision=6, scale=4), nullable=True),
        sa.Column("employer_rate", sa.Numeric(precision=6, scale=4), nullable=True),
        sa.Column("employee_amount_minor", sa.BigInteger(), nullable=True),
        sa.Column("employer_amount_minor", sa.BigInteger(), nullable=True),
        sa.Column("premium_minor", sa.BigInteger(), nullable=True),
        sa.Column("employee_share", sa.Numeric(precision=6, scale=4), nullable=True),
        sa.Column("requires_authorisation", sa.Boolean(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        *_common(),
        _dated("deduction_type"),
        sa.CheckConstraint(
            "kind IN ('PERCENT_OF_BASIC', 'PERCENT_OF_GROSS', 'FIXED', 'SPLIT_PREMIUM')",
            name="ck_hr_deduction_type_kind",
        ),
        sa.CheckConstraint(
            f"rule_state IN {STATES}", name="ck_hr_deduction_type_rule_state"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "organisation_id",
            "code",
            "effective_from",
            name="uq_hr_deduction_type_code",
        ),
        schema="hr",
    )
    _index("deduction_type")
    op.create_table(
        "employee_deduction",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        *_org(),
        sa.Column("deduction_type_id", sa.Uuid(), nullable=False),
        sa.Column("employee_amount_minor", sa.BigInteger(), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=False),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("authorised_at", sa.DateTime(), nullable=True),
        sa.Column("authorised_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("authorisation_reference", sa.String(length=200), nullable=True),
        sa.Column("employee_confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        _dated("employee_deduction"),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["deduction_type_id"], ["hr.deduction_type.id"]),
        sa.ForeignKeyConstraint(["authorised_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="hr",
    )
    _index("employee_deduction")
    op.create_index(
        "hr_employee_deduction_user_id_idx",
        "employee_deduction",
        ["user_id"],
        schema="hr",
    )
    op.create_table(
        "pay_deduction_line",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("period_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("category", sa.String(length=24), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("base_minor", sa.BigInteger(), nullable=False),
        sa.Column("employee_minor", sa.BigInteger(), nullable=False),
        sa.Column("employer_minor", sa.BigInteger(), nullable=False),
        sa.Column("source_id", sa.Uuid(), nullable=False),
        sa.Column("source_rule_state", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "category IN ('INCOME_TAX', 'SOCIAL_INSURANCE', 'OTHER')",
            name="ck_hr_pay_deduction_line_category",
        ),
        sa.ForeignKeyConstraint(["period_id"], ["hr.pay_period.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "period_id", "user_id", "code", name="uq_hr_pay_deduction_line_code"
        ),
        schema="hr",
    )
    op.create_index(
        "hr_pay_deduction_line_period_id_idx",
        "pay_deduction_line",
        ["period_id"],
        schema="hr",
    )
    op.create_index(
        "hr_pay_deduction_line_user_id_idx",
        "pay_deduction_line",
        ["user_id"],
        schema="hr",
    )
    # Locked like pay lines, with one controlled exception: the audited "table
    # state refresh" may change source_rule_state only (nothing else), and only
    # inside a transaction that set payroll.refresh_table_state.
    op.execute(
        """
        CREATE FUNCTION hr.pay_deduction_line_is_locked() RETURNS trigger AS $$
        DECLARE
          period_status text;
          period_issued timestamp;
        BEGIN
          SELECT status, issue_approved_at INTO period_status, period_issued
            FROM hr.pay_period
            WHERE id = COALESCE(NEW.period_id, OLD.period_id);
          IF TG_OP = 'UPDATE'
             AND COALESCE(current_setting('payroll.refresh_table_state', true), '') = 'on'
             AND (to_jsonb(NEW) - 'source_rule_state') = (to_jsonb(OLD) - 'source_rule_state')
             AND period_status IN ('APPROVED', 'EXPORTED')
             AND period_issued IS NULL THEN
            RETURN NEW;
          END IF;
          IF period_status IS DISTINCT FROM 'OPEN' THEN
            RAISE EXCEPTION 'hr.pay_deduction_line: period % is %, lines are locked',
              COALESCE(NEW.period_id, OLD.period_id), period_status;
          END IF;
          IF TG_OP = 'DELETE' THEN
            RETURN OLD;
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER pay_deduction_line_locked
          BEFORE INSERT OR UPDATE OR DELETE ON hr.pay_deduction_line
          FOR EACH ROW EXECUTE FUNCTION hr.pay_deduction_line_is_locked();
        """
    )


def downgrade() -> None:
    bind = op.get_bind()
    for table in ("pay_deduction_line", "employee_deduction"):
        query = sa.select(sa.literal(1)).select_from(sa.table(table, schema="hr"))
        if bind.execute(query.limit(1)).first():
            raise RuntimeError(f"hr.{table} has rows; remove them before downgrading")
    # Tables someone created or confirmed (seeded rows have neither) are
    # payroll decisions: never dropped by a downgrade.
    for table in ("tax_table", "social_insurance_scheme", "deduction_type"):
        entered = (
            sa.select(sa.literal(1))
            .select_from(sa.table(table, schema="hr"))
            .where(
                sa.or_(
                    sa.column("created_by_user_id").is_not(None),
                    sa.column("confirmed_by_user_id").is_not(None),
                )
            )
        )
        if bind.execute(entered.limit(1)).first():
            raise RuntimeError(
                f"hr.{table} holds tables entered or confirmed by staff; remove them first"
            )
    op.execute("DROP TRIGGER pay_deduction_line_locked ON hr.pay_deduction_line")
    op.execute("DROP FUNCTION hr.pay_deduction_line_is_locked()")
    for table in (
        "pay_deduction_line",
        "employee_deduction",
        "deduction_type",
        "social_insurance_scheme",
        "tax_band",
        "tax_table",
    ):
        op.drop_table(table, schema="hr")
    op.drop_constraint(
        "pay_period_issue_approved_by_user_id_fkey", "pay_period", schema="hr"
    )
    op.drop_column("pay_period", "issue_approved_by_user_id", schema="hr")
    op.drop_column("pay_period", "issue_approved_at", schema="hr")
