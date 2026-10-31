"""Payroll slice 4: payslips (append-only snapshots) and export settings.

Additive: two new ``hr`` tables. ``payslip`` rows can never be updated or
deleted (``payslip_append_only`` trigger); a correction is a later period's
adjustment and its own payslip.

Revision ID: payrollpayslips20261031
Revises: payrolldeductions20261031
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "payrollpayslips20261031"
down_revision = "payrolldeductions20261031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "payslip",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("period_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("net_minor", sa.BigInteger(), nullable=False),
        sa.Column("issued_at", sa.DateTime(), nullable=False),
        sa.Column("issued_by_user_id", sa.Uuid(), nullable=False),
        sa.ForeignKeyConstraint(["period_id"], ["hr.pay_period.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["organisation_id"], ["hr.organisation.id"]),
        sa.ForeignKeyConstraint(["issued_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("period_id", "user_id", name="uq_hr_payslip_period_user"),
        schema="hr",
    )
    for column in ("period_id", "user_id", "organisation_id"):
        op.create_index(f"hr_payslip_{column}_idx", "payslip", [column], schema="hr")
    op.create_table(
        "payroll_export_setting",
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column(
            "bank_columns", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column(
            "gl_accounts", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["organisation_id"], ["hr.organisation.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("organisation_id"),
        schema="hr",
    )
    op.execute(
        """
        CREATE FUNCTION hr.payslip_is_append_only() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'hr.payslip is append-only';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER payslip_append_only
          BEFORE UPDATE OR DELETE ON hr.payslip
          FOR EACH ROW EXECUTE FUNCTION hr.payslip_is_append_only();
        """
    )


def downgrade() -> None:
    query = sa.select(sa.literal(1)).select_from(sa.table("payslip", schema="hr"))
    if op.get_bind().execute(query.limit(1)).first():
        raise RuntimeError("hr.payslip has issued payslips; they are never dropped")
    op.execute("DROP TRIGGER payslip_append_only ON hr.payslip")
    op.execute("DROP FUNCTION hr.payslip_is_append_only()")
    op.drop_table("payroll_export_setting", schema="hr")
    op.drop_table("payslip", schema="hr")
