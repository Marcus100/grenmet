"""cap domain

Revision ID: 52ef8a4c7d91
Revises: 8f2cc7b3e0f1
Create Date: 2026-06-02

Create the CAP schema, tables, and auth permission keys.
"""

import uuid

import sqlalchemy as sa

from alembic import op

revision = "52ef8a4c7d91"
down_revision = "8f2cc7b3e0f1"
branch_labels = None
depends_on = None


CAP_PERMISSIONS = [
    ("cap.alert.read", "read", "cap.alert", "any", "Read CAP alerts"),
    ("cap.alert.create", "create", "cap.alert", "any", "Create CAP alerts"),
    ("cap.alert.edit", "edit", "cap.alert", "any", "Edit CAP alerts"),
    ("cap.alert.submit", "submit", "cap.alert", "any", "Submit CAP alerts"),
    ("cap.alert.approve", "approve", "cap.alert", "any", "Approve CAP alerts"),
    ("cap.alert.publish", "publish", "cap.alert", "any", "Publish CAP alerts"),
    ("cap.settings.manage", "manage", "cap.settings", "any", "Manage CAP settings"),
    (
        "cap.integrations.manage",
        "manage",
        "cap.integrations",
        "any",
        "Manage CAP integrations",
    ),
]


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS cap")
    op.execute(
        """
        DO $$
        BEGIN
            CREATE EXTENSION IF NOT EXISTS postgis;
        EXCEPTION WHEN undefined_file OR feature_not_supported THEN
            RAISE NOTICE 'PostGIS extension is not available in this database image.';
        END $$;
        """
    )

    cap_lifecycle_state = sa.Enum(
        "DRAFT",
        "SUBMITTED",
        "APPROVED",
        "PUBLISHED",
        "EXPIRED",
        "CANCELLED",
        name="caplifecyclestate",
    )
    cap_status = sa.Enum(
        "ACTUAL", "EXERCISE", "SYSTEM", "TEST", "DRAFT", name="capstatus"
    )
    cap_message_type = sa.Enum(
        "ALERT", "UPDATE", "CANCEL", "ACK", "ERROR", name="capmessagetype"
    )
    cap_scope = sa.Enum("PUBLIC", "RESTRICTED", "PRIVATE", name="capscope")
    cap_category = sa.Enum(
        "GEO",
        "MET",
        "SAFETY",
        "SECURITY",
        "RESCUE",
        "FIRE",
        "HEALTH",
        "ENV",
        "TRANSPORT",
        "INFRA",
        "CBRNE",
        "OTHER",
        name="capcategory",
    )
    cap_urgency = sa.Enum(
        "IMMEDIATE", "EXPECTED", "FUTURE", "PAST", "UNKNOWN", name="capurgency"
    )
    cap_severity = sa.Enum(
        "EXTREME", "SEVERE", "MODERATE", "MINOR", "UNKNOWN", name="capseverity"
    )
    cap_certainty = sa.Enum(
        "OBSERVED", "LIKELY", "POSSIBLE", "UNLIKELY", "UNKNOWN", name="capcertainty"
    )
    cap_area_kind = sa.Enum(
        "AREA",
        "PREDEFINED",
        "POLYGON",
        "MULTIPOLYGON",
        "CIRCLE",
        "GEOCODE",
        name="capareakind",
    )
    cap_integration_status = sa.Enum(
        "ACTIVE", "INACTIVE", "FAILED", name="capintegrationstatus"
    )
    cap_job_status = sa.Enum(
        "QUEUED", "RUNNING", "SUCCEEDED", "FAILED", name="capjobstatus"
    )

    op.create_table(
        "settings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sender", sa.String(length=255), nullable=False),
        sa.Column("sender_name", sa.String(length=255), nullable=False),
        sa.Column("wmo_oid", sa.String(length=120), nullable=True),
        sa.Column("web", sa.String(length=500), nullable=True),
        sa.Column("contact", sa.String(length=500), nullable=True),
        sa.Column("feed_limit", sa.Integer(), nullable=False),
        sa.Column("signing_enabled", sa.Boolean(), nullable=False),
        sa.Column("signing_certificate_ref", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="cap",
    )
    op.create_table(
        "hazard_type",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("code", sa.String(length=120), nullable=False),
        sa.Column("label", sa.String(length=255), nullable=False),
        sa.Column("category", cap_category, nullable=False),
        sa.Column("default_urgency", cap_urgency, nullable=False),
        sa.Column("default_severity", cap_severity, nullable=False),
        sa.Column("default_certainty", cap_certainty, nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
        schema="cap",
    )
    op.create_table(
        "predefined_area",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("area_desc", sa.String(length=1000), nullable=False),
        sa.Column("geometry", sa.JSON(), nullable=True),
        sa.Column("polygons", sa.JSON(), nullable=True),
        sa.Column("multipolygons", sa.JSON(), nullable=True),
        sa.Column("circles", sa.JSON(), nullable=True),
        sa.Column("geocodes", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        schema="cap",
    )
    op.create_table(
        "alert",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("identifier", sa.String(length=255), nullable=False),
        sa.Column("sender", sa.String(length=255), nullable=False),
        sa.Column("sent", sa.DateTime(), nullable=False),
        sa.Column("status", cap_status, nullable=False),
        sa.Column("msg_type", cap_message_type, nullable=False),
        sa.Column("source", sa.String(length=255), nullable=True),
        sa.Column("scope", cap_scope, nullable=False),
        sa.Column("restriction", sa.String(length=500), nullable=True),
        sa.Column("addresses", sa.JSON(), nullable=True),
        sa.Column("codes", sa.JSON(), nullable=True),
        sa.Column("note", sa.String(length=2000), nullable=True),
        sa.Column("lifecycle_state", cap_lifecycle_state, nullable=False),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=False),
        sa.Column("updated_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("published_at", sa.DateTime(), nullable=True),
        sa.Column("expired_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["updated_by_user_id"], ["user.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("identifier"),
        schema="cap",
    )
    op.create_index("ix_cap_alert_identifier", "alert", ["identifier"], schema="cap")
    op.create_index("ix_cap_alert_sender", "alert", ["sender"], schema="cap")
    op.create_index("ix_cap_alert_sent", "alert", ["sent"], schema="cap")
    op.create_index(
        "ix_cap_alert_lifecycle_state", "alert", ["lifecycle_state"], schema="cap"
    )
    op.create_index(
        "ix_cap_alert_created_by_user_id", "alert", ["created_by_user_id"], schema="cap"
    )

    op.create_table(
        "info",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("alert_id", sa.Uuid(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("language", sa.String(length=35), nullable=False),
        sa.Column("categories", sa.JSON(), nullable=True),
        sa.Column("event", sa.String(length=255), nullable=False),
        sa.Column("event_codes", sa.JSON(), nullable=True),
        sa.Column("response_types", sa.JSON(), nullable=True),
        sa.Column("urgency", cap_urgency, nullable=False),
        sa.Column("severity", cap_severity, nullable=False),
        sa.Column("certainty", cap_certainty, nullable=False),
        sa.Column("audience", sa.String(length=500), nullable=True),
        sa.Column("effective", sa.DateTime(), nullable=True),
        sa.Column("onset", sa.DateTime(), nullable=True),
        sa.Column("expires", sa.DateTime(), nullable=True),
        sa.Column("sender_name", sa.String(length=255), nullable=True),
        sa.Column("headline", sa.String(length=255), nullable=False),
        sa.Column("description", sa.String(length=4000), nullable=False),
        sa.Column("instruction", sa.String(length=4000), nullable=True),
        sa.Column("web", sa.String(length=500), nullable=True),
        sa.Column("contact", sa.String(length=500), nullable=True),
        sa.Column("parameters", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["alert_id"], ["cap.alert.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="cap",
    )
    op.create_index("ix_cap_info_alert_id", "info", ["alert_id"], schema="cap")
    op.create_index("ix_cap_info_expires", "info", ["expires"], schema="cap")

    op.create_table(
        "area",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("info_id", sa.Uuid(), nullable=False),
        sa.Column("predefined_area_id", sa.Uuid(), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("kind", cap_area_kind, nullable=False),
        sa.Column("area_desc", sa.String(length=1000), nullable=False),
        sa.Column("polygons", sa.JSON(), nullable=True),
        sa.Column("multipolygons", sa.JSON(), nullable=True),
        sa.Column("circles", sa.JSON(), nullable=True),
        sa.Column("geocodes", sa.JSON(), nullable=True),
        sa.Column("geometry", sa.JSON(), nullable=True),
        sa.Column("altitude", sa.Float(), nullable=True),
        sa.Column("ceiling", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["info_id"], ["cap.info.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["predefined_area_id"], ["cap.predefined_area.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="cap",
    )
    op.create_index("ix_cap_area_info_id", "area", ["info_id"], schema="cap")

    op.create_table(
        "resource",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("info_id", sa.Uuid(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("resource_desc", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=120), nullable=False),
        sa.Column("size", sa.Integer(), nullable=True),
        sa.Column("uri", sa.String(length=1000), nullable=True),
        sa.Column("deref_uri", sa.Text(), nullable=True),
        sa.Column("digest", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["info_id"], ["cap.info.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="cap",
    )
    op.create_index("ix_cap_resource_info_id", "resource", ["info_id"], schema="cap")

    op.create_table(
        "reference",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("alert_id", sa.Uuid(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("sender", sa.String(length=255), nullable=False),
        sa.Column("identifier", sa.String(length=255), nullable=False),
        sa.Column("sent", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["alert_id"], ["cap.alert.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="cap",
    )
    op.create_index("ix_cap_reference_alert_id", "reference", ["alert_id"], schema="cap")

    op.create_table(
        "incident",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("alert_id", sa.Uuid(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("value", sa.String(length=255), nullable=False),
        sa.ForeignKeyConstraint(["alert_id"], ["cap.alert.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="cap",
    )
    op.create_index("ix_cap_incident_alert_id", "incident", ["alert_id"], schema="cap")

    op.create_table(
        "snapshot",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("alert_id", sa.Uuid(), nullable=False),
        sa.Column("identifier", sa.String(length=255), nullable=False),
        sa.Column("xml", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(length=64), nullable=False),
        sa.Column("generated_at", sa.DateTime(), nullable=False),
        sa.Column("signed_at", sa.DateTime(), nullable=True),
        sa.Column("signing_key_ref", sa.String(length=255), nullable=True),
        sa.ForeignKeyConstraint(["alert_id"], ["cap.alert.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        schema="cap",
    )
    op.create_index("ix_cap_snapshot_alert_id", "snapshot", ["alert_id"], schema="cap")
    op.create_index(
        "ix_cap_snapshot_identifier", "snapshot", ["identifier"], schema="cap"
    )
    op.create_index(
        "ix_cap_snapshot_content_hash", "snapshot", ["content_hash"], schema="cap"
    )
    op.create_index(
        "ix_cap_snapshot_generated_at", "snapshot", ["generated_at"], schema="cap"
    )

    op.create_table(
        "webhook",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("url", sa.String(length=1000), nullable=False),
        sa.Column("secret_ref", sa.String(length=255), nullable=True),
        sa.Column("event_types", sa.JSON(), nullable=True),
        sa.Column("status", cap_integration_status, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="cap",
    )
    op.create_table(
        "mqtt_broker",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("host", sa.String(length=255), nullable=False),
        sa.Column("port", sa.Integer(), nullable=False),
        sa.Column("topic", sa.String(length=255), nullable=False),
        sa.Column("username", sa.String(length=255), nullable=True),
        sa.Column("password_ref", sa.String(length=255), nullable=True),
        sa.Column("status", cap_integration_status, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="cap",
    )
    op.create_table(
        "feed_import",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("url", sa.String(length=1000), nullable=False),
        sa.Column("status", cap_integration_status, nullable=False),
        sa.Column("last_checked_at", sa.DateTime(), nullable=True),
        sa.Column("last_error", sa.String(length=2000), nullable=True),
        sa.Column("last_etag", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        schema="cap",
    )
    op.create_table(
        "job_event",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("alert_id", sa.Uuid(), nullable=True),
        sa.Column("snapshot_id", sa.Uuid(), nullable=True),
        sa.Column("kind", sa.String(length=120), nullable=False),
        sa.Column("status", cap_job_status, nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("result", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["alert_id"], ["cap.alert.id"]),
        sa.ForeignKeyConstraint(["snapshot_id"], ["cap.snapshot.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="cap",
    )
    op.create_index("ix_cap_job_event_status", "job_event", ["status"], schema="cap")

    op.create_table(
        "audit_event",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("alert_id", sa.Uuid(), nullable=True),
        sa.Column("actor_user_id", sa.Uuid(), nullable=True),
        sa.Column("action", sa.String(length=120), nullable=False),
        sa.Column("previous_state", sa.String(length=80), nullable=True),
        sa.Column("next_state", sa.String(length=80), nullable=True),
        sa.Column("note", sa.String(length=2000), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["user.id"]),
        sa.ForeignKeyConstraint(["alert_id"], ["cap.alert.id"]),
        sa.PrimaryKeyConstraint("id"),
        schema="cap",
    )
    op.create_index(
        "ix_cap_audit_event_action", "audit_event", ["action"], schema="cap"
    )
    op.create_index(
        "ix_cap_audit_event_created_at", "audit_event", ["created_at"], schema="cap"
    )

    for key, action, entity, access, description in CAP_PERMISSIONS:
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


def downgrade() -> None:
    for key, *_ in CAP_PERMISSIONS:
        op.execute(sa.text("DELETE FROM permission WHERE key = :key").bindparams(key=key))

    op.drop_index("ix_cap_audit_event_created_at", table_name="audit_event", schema="cap")
    op.drop_index("ix_cap_audit_event_action", table_name="audit_event", schema="cap")
    op.drop_table("audit_event", schema="cap")
    op.drop_index("ix_cap_job_event_status", table_name="job_event", schema="cap")
    op.drop_table("job_event", schema="cap")
    op.drop_table("feed_import", schema="cap")
    op.drop_table("mqtt_broker", schema="cap")
    op.drop_table("webhook", schema="cap")
    op.drop_index("ix_cap_snapshot_generated_at", table_name="snapshot", schema="cap")
    op.drop_index("ix_cap_snapshot_content_hash", table_name="snapshot", schema="cap")
    op.drop_index("ix_cap_snapshot_identifier", table_name="snapshot", schema="cap")
    op.drop_index("ix_cap_snapshot_alert_id", table_name="snapshot", schema="cap")
    op.drop_table("snapshot", schema="cap")
    op.drop_index("ix_cap_incident_alert_id", table_name="incident", schema="cap")
    op.drop_table("incident", schema="cap")
    op.drop_index("ix_cap_reference_alert_id", table_name="reference", schema="cap")
    op.drop_table("reference", schema="cap")
    op.drop_index("ix_cap_resource_info_id", table_name="resource", schema="cap")
    op.drop_table("resource", schema="cap")
    op.drop_index("ix_cap_area_info_id", table_name="area", schema="cap")
    op.drop_table("area", schema="cap")
    op.drop_index("ix_cap_info_expires", table_name="info", schema="cap")
    op.drop_index("ix_cap_info_alert_id", table_name="info", schema="cap")
    op.drop_table("info", schema="cap")
    op.drop_index("ix_cap_alert_created_by_user_id", table_name="alert", schema="cap")
    op.drop_index("ix_cap_alert_lifecycle_state", table_name="alert", schema="cap")
    op.drop_index("ix_cap_alert_sent", table_name="alert", schema="cap")
    op.drop_index("ix_cap_alert_sender", table_name="alert", schema="cap")
    op.drop_index("ix_cap_alert_identifier", table_name="alert", schema="cap")
    op.drop_table("alert", schema="cap")
    op.drop_table("predefined_area", schema="cap")
    op.drop_table("hazard_type", schema="cap")
    op.drop_table("settings", schema="cap")
    op.execute("DROP SCHEMA IF EXISTS cap")
