"""Give existing CAP settings managers the new hazard library permission.

Hazard library editing moved from ``cap.settings.manage`` to
``cap.library.manage``. Role seeding never adds a key to a role that already
exists, so without this grant no existing CAP admin could save or approve a
library version after the deploy.

Revision ID: caplibrarymanage20261027
Revises: notifoccurrencenull20261025
"""

import uuid

import sqlalchemy as sa

from alembic import op

revision = "caplibrarymanage20261027"
down_revision = "notifoccurrencenull20261025"
branch_labels = None
depends_on = None

KEY = "cap.library.manage"


def upgrade() -> None:
    op.execute(
        sa.text(
            """
            INSERT INTO permission (
                id, key, action, entity, access, description, created_at, updated_at
            )
            VALUES (
                CAST(:id AS uuid), :key, 'library', 'cap', 'manage',
                'Edit the hazard library and impact-based matrix', NOW(), NOW()
            )
            ON CONFLICT (key) DO NOTHING
            """
        ).bindparams(id=str(uuid.uuid4()), key=KEY)
    )
    op.execute(
        sa.text(
            """
            INSERT INTO role_permission (role_id, permission_id)
            SELECT DISTINCT role_permission.role_id, new_permission.id
            FROM role_permission
            JOIN permission AS held ON held.id = role_permission.permission_id
            CROSS JOIN permission AS new_permission
            WHERE held.key = 'cap.settings.manage' AND new_permission.key = :key
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
