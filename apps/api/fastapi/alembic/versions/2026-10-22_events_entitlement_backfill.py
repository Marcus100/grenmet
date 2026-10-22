"""Organisations behind an events organiser get the ``events`` product (ADR-0044, S2).

Data only. Organisation-bound Events routes (``/events/org/...``) now require the
``events`` entitlement. Every organisation already linked to an events organiser
(``events.organisers.organisation_id``) gets ``org.organisation_app`` ``events``
enabled so nobody is locked out. Idempotent: an existing row is switched on, never
duplicated; an organisation with no organiser is untouched.

Revision ID: eventsentitlement20261022
Revises: membershipgrant20261022
"""

from alembic import op

revision = "eventsentitlement20261022"
down_revision = "membershipgrant20261022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO org.organisation_app (
            organisation_id, app_key, enabled, created_at, updated_at
        )
        SELECT o.id, 'events', true,
               (now() AT TIME ZONE 'utc'), (now() AT TIME ZONE 'utc')
        FROM org.organisation o
        WHERE o.id IN (
            SELECT organisation_id FROM events.organisers
            WHERE organisation_id IS NOT NULL
        )
        ON CONFLICT (organisation_id, app_key) DO UPDATE
            SET enabled = true, updated_at = EXCLUDED.updated_at
        """
    )


def downgrade() -> None:
    # Cannot tell backfilled rows from deliberate grants; removing them could
    # revoke real access, so they stay.
    pass
