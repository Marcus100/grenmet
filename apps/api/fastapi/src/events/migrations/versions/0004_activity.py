"""Events activity log (F7): append-only history of organiser and moderation changes.

Rows record who (an auth ``user_id``), what (``action``), on which entity and a
short diff summary. No names, emails or free-text bodies. A trigger rejects
UPDATE and DELETE so history cannot be rewritten through the application.
"""

from alembic import op

revision = "events_0004"
down_revision = "events_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE activity (
          id UUID PRIMARY KEY,
          organiser_id UUID,
          entity_type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          action TEXT NOT NULL,
          actor_id UUID NOT NULL,
          summary JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        );
        CREATE INDEX ix_activity_entity
          ON activity (entity_type, entity_id, created_at DESC);
        CREATE INDEX ix_activity_organiser
          ON activity (organiser_id, created_at DESC);
        CREATE FUNCTION activity_is_append_only() RETURNS trigger AS $$
        BEGIN
          RAISE EXCEPTION 'activity is append-only';
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER activity_append_only
          BEFORE UPDATE OR DELETE ON activity
          FOR EACH ROW EXECUTE FUNCTION activity_is_append_only();
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE activity;
        DROP FUNCTION activity_is_append_only();
    """)
