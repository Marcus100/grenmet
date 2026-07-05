"""shift catalog ends_next_day + Met Office seed

Revision ID: e6a8c0d2f4b6
Revises: d3f5a7c9e1b4
Create Date: 2026-07-03

Adds the explicit ends_next_day flag to hr.shift_catalog (a shift whose
end_time falls on the day after assignment_date — the night shift N) and
seeds the eight Met Office duty-roster codes. Times come from the official
roster legend (M 0530-1400, D 0800-1600, E 1400-2230, N 2230-0600).

Inserts are idempotent (ON CONFLICT DO NOTHING) so environments where the
catalog was hand-populated are left untouched.
"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "e6a8c0d2f4b6"
down_revision = "d3f5a7c9e1b4"
branch_labels = None
depends_on = None

SEED_CODES = ("M", "D", "E", "N", "O", "L", "V", "S")


def upgrade() -> None:
    op.add_column(
        "shift_catalog",
        sa.Column(
            "ends_next_day",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="hr",
    )

    op.execute(
        """
        INSERT INTO hr.shift_catalog
            (code, label, category, start_time, end_time, ends_next_day,
             counts_as_work_hours, needs_reason, needs_approval, is_active,
             created_at, updated_at)
        VALUES
            ('M', 'Morning',       'WORK',  '05:30', '14:00', false, true,  false, false, true, NOW(), NOW()),
            ('D', 'Day',           'WORK',  '08:00', '16:00', false, true,  false, false, true, NOW(), NOW()),
            ('E', 'Evening',       'WORK',  '14:00', '22:30', false, true,  false, false, true, NOW(), NOW()),
            ('N', 'Night',         'WORK',  '22:30', '06:00', true,  true,  false, false, true, NOW(), NOW()),
            ('O', 'Off Duty',      'OFF',   NULL,    NULL,    false, false, false, false, true, NOW(), NOW()),
            ('L', 'Leave (Other)', 'LEAVE', NULL,    NULL,    false, false, true,  true,  true, NOW(), NOW()),
            ('V', 'Vacation',      'LEAVE', NULL,    NULL,    false, false, false, true,  true, NOW(), NOW()),
            ('S', 'Study Leave',   'LEAVE', NULL,    NULL,    false, false, false, true,  true, NOW(), NOW())
        ON CONFLICT (code) DO NOTHING
        """
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM hr.shift_catalog WHERE code IN "
        + "('"
        + "', '".join(SEED_CODES)
        + "')"
    )
    op.drop_column("shift_catalog", "ends_next_day", schema="hr")
