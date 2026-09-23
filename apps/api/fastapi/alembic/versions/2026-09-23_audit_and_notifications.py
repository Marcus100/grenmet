"""Platform change history and notifications (in-app inbox + email outbox).

Revision ID: a7b8c9d0e1f2
Revises: f1a2b3c4d5e6

Also adds the ``audit.view_sensitive`` and ``notifications.manage`` permissions
and grants them to an existing ``hr-admin`` role: the role seeder only bundles
permissions when it first creates a role, so existing databases need this.
"""

import uuid

import sqlalchemy as sa

from alembic import op

revision = "a7b8c9d0e1f2"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None

PERMISSIONS = (
    (
        "audit.view_sensitive",
        "audit",
        "view_sensitive",
        "any",
        "See the values of sensitive fields (medical, address, contact) in change history",
    ),
    (
        "notifications.manage",
        "notifications",
        "manage",
        "any",
        "Configure organisation notifications: on/off, recipients, wording, timings",
    ),
)


def upgrade() -> None:
    op.create_table(
        "audit_entry",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("entity_type", sa.String(60), nullable=False),
        sa.Column("entity_id", sa.String(100), nullable=False),
        sa.Column("record_type", sa.String(60), nullable=False),
        sa.Column("record_id", sa.String(100), nullable=False),
        sa.Column("organisation_id", sa.String(100)),
        sa.Column("action", sa.String(20), nullable=False),
        sa.Column(
            "actor_user_id", sa.Uuid(), sa.ForeignKey("user.id", ondelete="SET NULL")
        ),
        sa.Column("changes", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_audit_entry_entity",
        "audit_entry",
        ["entity_type", "entity_id", "created_at"],
    )
    op.create_index("audit_entry_actor_user_id_idx", "audit_entry", ["actor_user_id"])

    op.create_table(
        "notification",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "recipient_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_key", sa.String(80), nullable=False),
        sa.Column("organisation_id", sa.String(100)),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.String(1000), nullable=False),
        sa.Column("link_path", sa.String(300)),
        sa.Column("entity_type", sa.String(60)),
        sa.Column("entity_id", sa.String(100)),
        sa.Column("dedupe_key", sa.String(300), unique=True),
        sa.Column("read_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_notification_recipient_inbox",
        "notification",
        ["recipient_user_id", "read_at", "created_at"],
    )

    op.create_table(
        "notification_delivery",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "notification_id",
            sa.Uuid(),
            sa.ForeignKey("notification.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("channel", sa.String(20), nullable=False),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("next_retry_at", sa.DateTime()),
        sa.Column("last_error", sa.String(1000)),
        sa.Column("sent_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_notification_delivery_due",
        "notification_delivery",
        ["status", "next_retry_at"],
    )
    op.create_index(
        "notification_delivery_notification_id_idx",
        "notification_delivery",
        ["notification_id"],
    )

    op.create_table(
        "notification_setting",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "organisation_id",
            sa.String(100),
            sa.ForeignKey("hr.organisation.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("event_key", sa.String(80), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("email_enabled", sa.Boolean(), nullable=False),
        sa.Column("recipient_roles", sa.JSON(), nullable=False),
        sa.Column("title_template", sa.String(200)),
        sa.Column("body_template", sa.String(1000)),
        sa.Column("params", sa.JSON(), nullable=False),
        sa.Column(
            "updated_by_user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="SET NULL"),
        ),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint(
            "organisation_id", "event_key", name="uq_notification_setting_event"
        ),
    )

    op.create_table(
        "notification_preference",
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("user.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("event_key", sa.String(80), primary_key=True),
        sa.Column("email_enabled", sa.Boolean(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    for key, entity, action, access, description in PERMISSIONS:
        op.execute(
            sa.text(
                """
                INSERT INTO permission (
                    id, key, action, entity, access, description, created_at, updated_at
                )
                VALUES (
                    CAST(:id AS uuid), :key, :action, :entity, :access, :description, NOW(), NOW()
                )
                ON CONFLICT (key) DO NOTHING
                """
            ).bindparams(
                id=str(uuid.uuid4()),
                key=key,
                action=action,
                entity=entity,
                access=access,
                description=description,
            )
        )
        op.execute(
            sa.text(
                """
                INSERT INTO role_permission (role_id, permission_id)
                SELECT role.id, permission.id
                FROM role, permission
                WHERE role.name = 'hr-admin' AND permission.key = :key
                ON CONFLICT DO NOTHING
                """
            ).bindparams(key=key)
        )


def downgrade() -> None:
    for key, *_ in PERMISSIONS:
        op.execute(
            sa.text(
                "DELETE FROM role_permission WHERE permission_id IN "
                "(SELECT id FROM permission WHERE key = :key)"
            ).bindparams(key=key)
        )
        op.execute(
            sa.text("DELETE FROM permission WHERE key = :key").bindparams(key=key)
        )
    op.drop_table("notification_preference")
    op.drop_table("notification_setting")
    op.drop_table("notification_delivery")
    op.drop_table("notification")
    op.drop_table("audit_entry")
