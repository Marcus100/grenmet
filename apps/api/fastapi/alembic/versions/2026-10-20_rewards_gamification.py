"""Rewards gamification core (PF9): venues, trails, check-ins, achievements.

Additive: six new tables in the existing ``rewards`` schema. The append-only
ledger trigger on ``rewards.entry`` is untouched.

Revision ID: rewardsgame20261020
Revises: orgsites20261020
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "rewardsgame20261020"
down_revision = "orgcontacts20261020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "venue",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("secret_encrypted", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("venue_organisation_id_fkey"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("venue_pkey")),
        schema="rewards",
    )
    op.create_index(
        "ix_rewards_venue_organisation",
        "venue",
        ["organisation_id"],
        schema="rewards",
    )
    op.create_table(
        "trail",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("starts_on", sa.Date(), nullable=True),
        sa.Column("ends_on", sa.Date(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "kind IN ('parish', 'festival', 'custom')", name=op.f("trail_kind_check")
        ),
        sa.CheckConstraint(
            "status IN ('draft', 'active', 'archived')",
            name=op.f("trail_status_check"),
        ),
        sa.CheckConstraint(
            "starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on",
            name=op.f("trail_window_check"),
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("trail_organisation_id_fkey"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("trail_pkey")),
        schema="rewards",
    )
    op.create_index(
        "ix_rewards_trail_organisation", "trail", ["organisation_id"], schema="rewards"
    )
    op.create_table(
        "trail_stop",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("trail_id", sa.Uuid(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("venue_id", sa.Uuid(), nullable=True),
        sa.Column("required_check_in", sa.Boolean(), nullable=False),
        sa.CheckConstraint("position > 0", name=op.f("trail_stop_position_check")),
        sa.CheckConstraint(
            "NOT required_check_in OR venue_id IS NOT NULL",
            name=op.f("trail_stop_required_venue_check"),
        ),
        sa.ForeignKeyConstraint(
            ["trail_id"],
            ["rewards.trail.id"],
            name=op.f("trail_stop_trail_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["venue_id"], ["rewards.venue.id"], name=op.f("trail_stop_venue_id_fkey")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("trail_stop_pkey")),
        sa.UniqueConstraint("trail_id", "position", name="uq_rewards_trail_stop_pos"),
        schema="rewards",
    )
    op.create_index(
        "ix_rewards_trail_stop_venue", "trail_stop", ["venue_id"], schema="rewards"
    )
    op.create_table(
        "check_in",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("venue_id", sa.Uuid(), nullable=False),
        sa.Column("trail_stop_id", sa.Uuid(), nullable=True),
        sa.Column("local_date", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["user.id"], name=op.f("check_in_user_id_fkey")
        ),
        sa.ForeignKeyConstraint(
            ["venue_id"], ["rewards.venue.id"], name=op.f("check_in_venue_id_fkey")
        ),
        sa.ForeignKeyConstraint(
            ["trail_stop_id"],
            ["rewards.trail_stop.id"],
            name=op.f("check_in_trail_stop_id_fkey"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("check_in_pkey")),
        sa.UniqueConstraint(
            "user_id", "venue_id", "local_date", name="uq_rewards_check_in_day"
        ),
        schema="rewards",
    )
    op.create_index(
        "ix_rewards_check_in_user_date",
        "check_in",
        ["user_id", "local_date"],
        schema="rewards",
    )
    op.create_table(
        "achievement_definition",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=True),
        sa.Column("key", sa.String(length=60), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("rule_type", sa.String(length=40), nullable=False),
        sa.Column(
            "parameters", postgresql.JSONB(astext_type=sa.Text()), nullable=False
        ),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "rule_type IN ('attended_n_events', 'visited_all_stops_of_trail', "
            "'streak_days')",
            name=op.f("achievement_definition_rule_check"),
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("achievement_definition_organisation_id_fkey"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("achievement_definition_pkey")),
        sa.UniqueConstraint("key", name="uq_rewards_achievement_key"),
        schema="rewards",
    )
    op.create_table(
        "achievement_award",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("definition_id", sa.Uuid(), nullable=False),
        sa.Column("awarded_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["user.id"], name=op.f("achievement_award_user_id_fkey")
        ),
        sa.ForeignKeyConstraint(
            ["definition_id"],
            ["rewards.achievement_definition.id"],
            name=op.f("achievement_award_definition_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("achievement_award_pkey")),
        sa.UniqueConstraint(
            "user_id", "definition_id", name="uq_rewards_achievement_award"
        ),
        schema="rewards",
    )


def downgrade() -> None:
    op.drop_table("achievement_award", schema="rewards")
    op.drop_table("achievement_definition", schema="rewards")
    op.drop_index("ix_rewards_check_in_user_date", "check_in", schema="rewards")
    op.drop_table("check_in", schema="rewards")
    op.drop_index("ix_rewards_trail_stop_venue", "trail_stop", schema="rewards")
    op.drop_table("trail_stop", schema="rewards")
    op.drop_index("ix_rewards_trail_organisation", "trail", schema="rewards")
    op.drop_table("trail", schema="rewards")
    op.drop_index("ix_rewards_venue_organisation", "venue", schema="rewards")
    op.drop_table("venue", schema="rewards")
