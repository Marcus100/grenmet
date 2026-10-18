"""Add keyed email hashes beside the plaintext addresses (step 1 of 2, additive).

Adds ``email_suppression.email_hash`` and ``list_subscription.email_hash``
(HMAC-SHA256 hex, see ``src/utils/email_hash.py``) and lets the plaintext
``email`` columns be NULL. Nothing is backfilled, hashed, nulled or dropped
here: the application hashes new and touched rows and still reads legacy
plaintext rows, so this revision is safe to deploy on its own.

Step 2 (NOT in this revision): backfill hashes for legacy rows with the
production ``EMAIL_HASH_PEPPER``, then null the plaintext of suppressed and
unsubscribed rows and drop the plaintext suppression column. That step destroys
data and cannot be reversed, so it ships only after a verified backup.

Backup gate status (checked 2026-10-18): ``scripts/production/core.sh deploy``
has no backup phase before ``migrations`` (phases: render-config, auth, disk,
pull-verify, databases, migrations, grants, start, smoke). Backups run
separately (``monitoring-maintenance.yml`` and ``backup-database.yml``;
``core.sh backup``). Step 2 must therefore wait for an explicit verified backup
or a deploy-time backup gate. See docs/operations/release-runbook.md.

Downgrade removes the hash columns and restores NOT NULL on the plaintext
columns, so it raises while any row has no plaintext address (for example after
step 2 or after an unsubscribe nulled it). Removed plaintext cannot be restored.

Revision ID: emailhash20261018
Revises: environment20261018
"""

import sqlalchemy as sa

from alembic import op

revision = "emailhash20261018"
down_revision = "environment20261018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("email_suppression", sa.Column("email_hash", sa.String(64)))
    op.create_unique_constraint(
        "email_suppression_email_hash_key", "email_suppression", ["email_hash"]
    )
    op.alter_column(
        "email_suppression", "email", existing_type=sa.String(320), nullable=True
    )

    op.add_column("list_subscription", sa.Column("email_hash", sa.String(64)))
    op.create_unique_constraint(
        "list_subscription_list_key_email_hash_key",
        "list_subscription",
        ["list_key", "email_hash"],
    )
    op.create_index(
        "ix_list_subscription_email_hash", "list_subscription", ["email_hash"]
    )
    op.create_index(
        "ix_list_subscription_status_requested",
        "list_subscription",
        ["status", "requested_at"],
    )
    op.alter_column(
        "list_subscription", "email", existing_type=sa.String(320), nullable=True
    )


def downgrade() -> None:
    bind = op.get_bind()
    counts = {
        "email_suppression": bind.scalar(
            sa.text("SELECT count(*) FROM email_suppression WHERE email IS NULL")
        ),
        "list_subscription": bind.scalar(
            sa.text("SELECT count(*) FROM list_subscription WHERE email IS NULL")
        ),
    }
    for table, missing in counts.items():
        if missing:
            raise RuntimeError(
                f"Cannot downgrade: {missing} {table} rows have no plaintext "
                "address and it cannot be restored from the hash."
            )
    op.alter_column(
        "list_subscription", "email", existing_type=sa.String(320), nullable=False
    )
    op.drop_index("ix_list_subscription_status_requested", "list_subscription")
    op.drop_index("ix_list_subscription_email_hash", "list_subscription")
    op.drop_constraint(
        "list_subscription_list_key_email_hash_key", "list_subscription", "unique"
    )
    op.drop_column("list_subscription", "email_hash")
    op.alter_column(
        "email_suppression", "email", existing_type=sa.String(320), nullable=False
    )
    op.drop_constraint(
        "email_suppression_email_hash_key", "email_suppression", "unique"
    )
    op.drop_column("email_suppression", "email_hash")
