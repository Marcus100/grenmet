"""Where an entitlement came from, and who created a business (ADR-0066 slice 1).

Additive, server defaults only, so the previous release (which does not know the
columns) keeps inserting and updating organisation rows:

- ``org.organisation_app.source``: ``manual`` | ``trial`` | ``subscription``. A
  server default of ``manual`` fills every existing row, so every grant made so far
  stays manual (and opted out of any subscription switch). Checked in the database.
- ``org.organisation.created_by_user_id``: the account that created a self-created
  business. Nullable; every existing organisation keeps it null.

The downgrade drops both columns, their check and foreign key, and nothing else.

Revision ID: orgentitlementsource20261124
Revises: bookinghygiene20261124
"""

import sqlalchemy as sa

from alembic import op

revision = "orgentitlementsource20261124"
down_revision = "bookinghygiene20261124"
branch_labels = None
depends_on = None

#: Final names (``op.f``): the metadata convention would add the table prefix again.
SOURCE_CHECK = "organisation_app_source_check"
CREATED_BY_FK = "organisation_created_by_user_id_fkey"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "organisation_app",
        sa.Column(
            "source",
            sa.String(length=20),
            nullable=False,
            server_default="manual",
        ),
        schema="org",
    )
    op.create_check_constraint(
        op.f(SOURCE_CHECK),
        "organisation_app",
        "source IN ('manual', 'trial', 'subscription')",
        schema="org",
    )
    op.add_column(
        "organisation",
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        schema="org",
    )
    # NOT VALID: the foreign key is enforced for every new row at once, and existing rows
    # (all null) are not scanned under a lock. VALIDATE CONSTRAINT in a later release.
    op.execute(
        f"ALTER TABLE org.organisation ADD CONSTRAINT {CREATED_BY_FK} "
        'FOREIGN KEY (created_by_user_id) REFERENCES "user" (id) '
        "ON DELETE SET NULL NOT VALID"
    )


def downgrade() -> None:
    op.drop_constraint(CREATED_BY_FK, "organisation", schema="org", type_="foreignkey")
    op.drop_column("organisation", "created_by_user_id", schema="org")
    op.drop_constraint(
        op.f(SOURCE_CHECK), "organisation_app", schema="org", type_="check"
    )
    op.drop_column("organisation_app", "source", schema="org")
