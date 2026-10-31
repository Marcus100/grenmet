"""HR roster rules as data (#380): rule sets, override log, employee coverage.

Additive only:
- ``hr.roster_rule_set``: one organisation default row (department NULL) and
  optional department rows that replace it. Every existing organisation gets a
  default row with the confirmed GAA values, all rules on.
- ``hr.roster_rule_override``: insert-only record of a supervisor saving despite
  rule warnings (who, when, rules, reason).
- ``hr.employment_record.union_covered`` (default true) and
  ``rule_worker_type`` (NULL = the department's worker type).
- Permission ``roster.rules.manage``, granted to the existing ``hr-admin`` role
  (role seeding never adds a key to a role that already exists).
- ``hr.shift_catalog.break_minutes`` (default 0): the unpaid break inside a shift.
  The seeded GMS M (05:30-14:00) and E (14:00-22:30) shifts get 30 minutes (owner,
  2026-10-31), so they count as 8 worked hours.

The old ``hr.department_policy`` rule columns stay in place and are no longer
read. Downgrade drops everything this revision added.

Revision ID: rosterrulesets20261031
Revises: refundcheck20261031
"""

import uuid

import sqlalchemy as sa

from alembic import op

revision = "rosterrulesets20261031"
down_revision = "refundcheck20261031"
branch_labels = None
depends_on = None

KEY = "roster.rules.manage"
EMPLOYMENT_CHECK = "employment_record_ck_hr_employment_rule_worker_type_check"


def _money(precision: int = 5) -> sa.Numeric:
    return sa.Numeric(precision, 2)


def upgrade() -> None:
    op.create_table(
        "roster_rule_set",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("department_id", sa.String(100), nullable=True),
        sa.Column("work_pattern", sa.String(20), nullable=False),
        sa.Column("worker_type", sa.String(20), nullable=False),
        sa.Column("max_consecutive_shifts", sa.Integer(), nullable=True),
        sa.Column("min_days_off_after_run", sa.Integer(), nullable=True),
        sa.Column("shift_daily_hours", _money(), nullable=True),
        sa.Column("shift_weekly_hours", _money(), nullable=True),
        sa.Column("non_shift_daily_hours", _money(), nullable=True),
        sa.Column("non_shift_weekly_hours", _money(), nullable=True),
        sa.Column("weekend_window_weeks", sa.Integer(), nullable=True),
        sa.Column("notice_days", sa.Integer(), nullable=True),
        sa.Column("overtime_bands_enabled", sa.Boolean(), nullable=False),
        sa.Column("weekday_first_hours", _money(), nullable=False),
        sa.Column("weekday_first_rate", _money(4), nullable=False),
        sa.Column("weekday_after_rate", _money(4), nullable=False),
        sa.Column("saturday_window_start", sa.String(5), nullable=False),
        sa.Column("saturday_window_end", sa.String(5), nullable=False),
        sa.Column("saturday_window_rate", _money(4), nullable=False),
        sa.Column("saturday_after_rate", _money(4), nullable=False),
        sa.Column("rest_day_first_hours", _money(), nullable=False),
        sa.Column("rest_day_first_rate", _money(4), nullable=False),
        sa.Column("rest_day_after_rate", _money(4), nullable=False),
        sa.Column("after_midnight_rate", _money(4), nullable=False),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "work_pattern IN ('ROTATION', 'WEEKDAYS')",
            name=op.f("roster_rule_set_ck_hr_roster_rule_set_work_pattern_check"),
        ),
        sa.CheckConstraint(
            "worker_type IN ('SHIFT', 'NON_SHIFT')",
            name=op.f("roster_rule_set_ck_hr_roster_rule_set_worker_type_check"),
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["hr.organisation.id"],
            name=op.f("roster_rule_set_organisation_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["hr.department.id"],
            name=op.f("roster_rule_set_department_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["updated_by_user_id"],
            ["user.id"],
            name=op.f("roster_rule_set_updated_by_user_id_fkey"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("roster_rule_set_pkey")),
        schema="hr",
    )
    op.create_index(
        op.f("hr_roster_rule_set_organisation_id_idx"),
        "roster_rule_set",
        ["organisation_id"],
        schema="hr",
    )
    op.create_index(
        "uq_hr_roster_rule_set_org_default",
        "roster_rule_set",
        ["organisation_id"],
        unique=True,
        schema="hr",
        postgresql_where=sa.text("department_id IS NULL"),
    )
    op.create_index(
        "uq_hr_roster_rule_set_department",
        "roster_rule_set",
        ["department_id"],
        unique=True,
        schema="hr",
        postgresql_where=sa.text("department_id IS NOT NULL"),
    )

    op.create_table(
        "roster_rule_override",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(100), nullable=False),
        sa.Column("department_id", sa.String(100), nullable=False),
        sa.Column("context", sa.String(20), nullable=False),
        sa.Column("entity_type", sa.String(50), nullable=False),
        sa.Column("entity_id", sa.String(100), nullable=False),
        sa.Column("rule_codes", sa.JSON(), nullable=False),
        sa.Column("violations", sa.JSON(), nullable=False),
        sa.Column("reason", sa.String(1000), nullable=False),
        sa.Column("overridden_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["hr.organisation.id"],
            name=op.f("roster_rule_override_organisation_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["hr.department.id"],
            name=op.f("roster_rule_override_department_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["overridden_by_user_id"],
            ["user.id"],
            name=op.f("roster_rule_override_overridden_by_user_id_fkey"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("roster_rule_override_pkey")),
        schema="hr",
    )
    op.create_index(
        op.f("hr_roster_rule_override_organisation_id_idx"),
        "roster_rule_override",
        ["organisation_id"],
        schema="hr",
    )
    op.create_index(
        op.f("hr_roster_rule_override_overridden_by_user_id_idx"),
        "roster_rule_override",
        ["overridden_by_user_id"],
        schema="hr",
    )
    op.create_index(
        "ix_hr_roster_rule_override_department_created",
        "roster_rule_override",
        ["department_id", "created_at"],
        schema="hr",
    )

    op.add_column(
        "employment_record",
        sa.Column(
            "union_covered", sa.Boolean(), server_default=sa.true(), nullable=False
        ),
        schema="hr",
    )
    op.add_column(
        "employment_record",
        sa.Column("rule_worker_type", sa.String(20), nullable=True),
        schema="hr",
    )
    op.create_check_constraint(
        op.f(EMPLOYMENT_CHECK),
        "employment_record",
        "rule_worker_type IS NULL OR rule_worker_type IN ('SHIFT', 'NON_SHIFT')",
        schema="hr",
    )

    op.add_column(
        "shift_catalog",
        sa.Column(
            "break_minutes", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        schema="hr",
    )
    op.execute(
        """
        UPDATE hr.shift_catalog SET break_minutes = 30
        WHERE (code = 'M' AND start_time = '05:30' AND end_time = '14:00')
           OR (code = 'E' AND start_time = '14:00' AND end_time = '22:30')
        """
    )

    # Confirmed GAA defaults (owner, 2026-10-31); editable per organisation and
    # department in HR setup.
    op.execute(
        """
        INSERT INTO hr.roster_rule_set (
            id, organisation_id, department_id, work_pattern, worker_type,
            max_consecutive_shifts, min_days_off_after_run,
            shift_daily_hours, shift_weekly_hours,
            non_shift_daily_hours, non_shift_weekly_hours,
            weekend_window_weeks, notice_days, overtime_bands_enabled,
            weekday_first_hours, weekday_first_rate, weekday_after_rate,
            saturday_window_start, saturday_window_end,
            saturday_window_rate, saturday_after_rate,
            rest_day_first_hours, rest_day_first_rate, rest_day_after_rate,
            after_midnight_rate, created_at, updated_at
        )
        SELECT
            gen_random_uuid(), organisation.id, NULL, 'ROTATION', 'SHIFT',
            3, 2, 8, 40, NULL, 35, 4, 7, true,
            4, 1.5, 2, '08:00', '12:00', 1.5, 2, 8, 2, 3, 2,
            NOW(), NOW()
        FROM hr.organisation AS organisation
        ON CONFLICT DO NOTHING
        """
    )

    op.execute(
        sa.text(
            """
            INSERT INTO permission (
                id, key, action, entity, access, description, created_at, updated_at
            )
            VALUES (
                CAST(:id AS uuid), :key, 'rules', 'roster', 'manage',
                'Edit roster rules and union coverage', NOW(), NOW()
            )
            ON CONFLICT (key) DO NOTHING
            """
        ).bindparams(id=str(uuid.uuid4()), key=KEY)
    )
    op.execute(
        sa.text(
            """
            INSERT INTO role_permission (role_id, permission_id)
            SELECT role.id, permission.id
            FROM role CROSS JOIN permission
            WHERE role.name = 'hr-admin' AND permission.key = :key
            ON CONFLICT DO NOTHING
            """
        ).bindparams(key=KEY)
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            """
            DELETE FROM role_permission
            WHERE permission_id IN (SELECT id FROM permission WHERE key = :key)
            """
        ).bindparams(key=KEY)
    )
    op.execute(sa.text("DELETE FROM permission WHERE key = :key").bindparams(key=KEY))
    op.drop_column("shift_catalog", "break_minutes", schema="hr")
    op.drop_constraint(
        op.f(EMPLOYMENT_CHECK), "employment_record", schema="hr", type_="check"
    )
    op.drop_column("employment_record", "rule_worker_type", schema="hr")
    op.drop_column("employment_record", "union_covered", schema="hr")
    op.drop_index(
        "ix_hr_roster_rule_override_department_created",
        table_name="roster_rule_override",
        schema="hr",
    )
    op.drop_index(
        op.f("hr_roster_rule_override_overridden_by_user_id_idx"),
        table_name="roster_rule_override",
        schema="hr",
    )
    op.drop_index(
        op.f("hr_roster_rule_override_organisation_id_idx"),
        table_name="roster_rule_override",
        schema="hr",
    )
    op.drop_table("roster_rule_override", schema="hr")
    op.drop_index(
        "uq_hr_roster_rule_set_department", table_name="roster_rule_set", schema="hr"
    )
    op.drop_index(
        "uq_hr_roster_rule_set_org_default", table_name="roster_rule_set", schema="hr"
    )
    op.drop_index(
        op.f("hr_roster_rule_set_organisation_id_idx"),
        table_name="roster_rule_set",
        schema="hr",
    )
    op.drop_table("roster_rule_set", schema="hr")
