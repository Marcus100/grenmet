"""Explicit CMS access; no automatic grants based on employment or old roles.

Revision ID: cmsaccess20261007
Revises: staffreq20261007
"""

import sqlalchemy as sa

from alembic import op

revision = "cmsaccess20261007"
down_revision = "staffreq20261007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "user",
        sa.Column("cms_access", sa.String(16), nullable=False, server_default="none"),
    )
    op.create_check_constraint(
        "ck_user_cms_access", "user", "cms_access IN ('none', 'writer', 'publisher')"
    )


def downgrade() -> None:
    op.drop_constraint("ck_user_cms_access", "user", type_="check")
    op.drop_column("user", "cms_access")
