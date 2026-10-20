"""Rewards social layer (PF10): leaderboard opt-ins, challenges, stamp gifts.

Additive: four new tables in the existing ``rewards`` schema. The append-only
ledger trigger on ``rewards.entry`` is untouched, and no gift is a ledger row.

Revision ID: rewardssocial20261020
Revises: payments20261020
"""

import sqlalchemy as sa

from alembic import op

revision = "rewardssocial20261020"
down_revision = "reliability20261020"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "leaderboard_opt_in",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("scope_kind", sa.String(length=20), nullable=False),
        sa.Column("scope_id", sa.String(length=100), nullable=False),
        sa.Column("display_alias", sa.String(length=40), nullable=True),
        sa.Column("show_name", sa.Boolean(), nullable=False),
        sa.Column("opted_in_at", sa.DateTime(), nullable=False),
        sa.Column("withdrawn_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "scope_kind IN ('organisation', 'trail')",
            name=op.f("leaderboard_opt_in_scope_kind_check"),
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["user.id"], name=op.f("leaderboard_opt_in_user_id_fkey")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("leaderboard_opt_in_pkey")),
        sa.UniqueConstraint(
            "user_id", "scope_kind", "scope_id", name="uq_rewards_opt_in_scope"
        ),
        schema="rewards",
    )
    op.create_index(
        "ix_rewards_opt_in_scope",
        "leaderboard_opt_in",
        ["scope_kind", "scope_id"],
        schema="rewards",
    )
    op.create_table(
        "challenge",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("metric", sa.String(length=30), nullable=False),
        sa.Column("target_total", sa.Integer(), nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=False),
        sa.Column("reward_description", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "metric IN ('venue_check_ins', 'trail_stops', 'events_attended')",
            name=op.f("challenge_metric_check"),
        ),
        sa.CheckConstraint(
            "status IN ('active', 'paused')", name=op.f("challenge_status_check")
        ),
        sa.CheckConstraint("target_total > 0", name=op.f("challenge_target_check")),
        sa.CheckConstraint("starts_at < ends_at", name=op.f("challenge_window_check")),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("challenge_organisation_id_fkey"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("challenge_pkey")),
        schema="rewards",
    )
    op.create_index(
        "ix_rewards_challenge_organisation",
        "challenge",
        ["organisation_id"],
        schema="rewards",
    )
    op.create_table(
        "challenge_progress",
        sa.Column("challenge_id", sa.Uuid(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=False),
        sa.Column("total_at_completion", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(
            ["challenge_id"],
            ["rewards.challenge.id"],
            name=op.f("challenge_progress_challenge_id_fkey"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("challenge_id", name=op.f("challenge_progress_pkey")),
        schema="rewards",
    )
    op.create_table(
        "gift",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("from_user_id", sa.Uuid(), nullable=False),
        sa.Column("to_user_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("check_in_id", sa.Uuid(), nullable=False),
        sa.Column("venue_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("reversed_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("kind IN ('passport_stamp')", name=op.f("gift_kind_check")),
        sa.CheckConstraint(
            "from_user_id <> to_user_id", name=op.f("gift_not_self_check")
        ),
        sa.ForeignKeyConstraint(
            ["from_user_id"], ["user.id"], name=op.f("gift_from_user_id_fkey")
        ),
        sa.ForeignKeyConstraint(
            ["to_user_id"], ["user.id"], name=op.f("gift_to_user_id_fkey")
        ),
        sa.ForeignKeyConstraint(
            ["check_in_id"], ["rewards.check_in.id"], name=op.f("gift_check_in_id_fkey")
        ),
        sa.ForeignKeyConstraint(
            ["venue_id"], ["rewards.venue.id"], name=op.f("gift_venue_id_fkey")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("gift_pkey")),
        schema="rewards",
    )
    op.create_index(
        "ix_rewards_gift_from",
        "gift",
        ["from_user_id", "created_at"],
        schema="rewards",
    )
    op.create_index("ix_rewards_gift_to", "gift", ["to_user_id"], schema="rewards")
    op.create_index(
        "uq_rewards_gift_live_source",
        "gift",
        ["check_in_id"],
        unique=True,
        schema="rewards",
        postgresql_where=sa.text("reversed_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_table("gift", schema="rewards")
    op.drop_table("challenge_progress", schema="rewards")
    op.drop_index("ix_rewards_challenge_organisation", "challenge", schema="rewards")
    op.drop_table("challenge", schema="rewards")
    op.drop_index("ix_rewards_opt_in_scope", "leaderboard_opt_in", schema="rewards")
    op.drop_table("leaderboard_opt_in", schema="rewards")
