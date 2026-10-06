"""Barrels Events: listings, organisers, groups, members and messaging.

Separate database (ADR-0003). People are identified by auth ``user_id`` UUIDs
with no cross-database foreign keys. Constrained text columns stand in for
enums so values can grow without type migrations.
"""

from alembic import op

revision = "events_0001"
down_revision = None
branch_labels = None
depends_on = None

CATEGORIES = "('fete','music','food','sport','business','tech','culture','faith','family','wellness')"
PARISHES = (
    "('st-george','st-andrew','st-david','st-patrick','st-mark','st-john','carriacou')"
)


def upgrade() -> None:
    op.execute(f"""
        CREATE TABLE organisers (
          id UUID PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
          bio TEXT NOT NULL DEFAULT '', verified BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        );
        CREATE TABLE organiser_members (
          organiser_id UUID NOT NULL REFERENCES organisers(id) ON DELETE CASCADE,
          user_id UUID NOT NULL, PRIMARY KEY (organiser_id, user_id)
        );
        CREATE TABLE member_profiles (
          user_id UUID PRIMARY KEY, handle TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL, headline TEXT NOT NULL DEFAULT '',
          bio TEXT NOT NULL DEFAULT '', parish TEXT NOT NULL DEFAULT 'st-george'
            CHECK (parish IN {PARISHES}),
          interests TEXT[] NOT NULL DEFAULT '{{}}', intents TEXT[] NOT NULL DEFAULT '{{}}',
          visibility TEXT NOT NULL DEFAULT 'public'
            CHECK (visibility IN ('public','connections')),
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
          updated_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        );
        CREATE TABLE groups (
          id UUID PRIMARY KEY, slug TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
          tagline TEXT NOT NULL DEFAULT '', about TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL CHECK (category IN {CATEGORIES}),
          parish TEXT NOT NULL CHECK (parish IN {PARISHES}),
          join_policy TEXT NOT NULL DEFAULT 'open' CHECK (join_policy IN ('open','approval')),
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        );
        CREATE TABLE group_members (
          group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
          user_id UUID NOT NULL,
          role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('host','member')),
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','pending')),
          joined_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
          PRIMARY KEY (group_id, user_id)
        );
        CREATE INDEX ix_group_members_user ON group_members (user_id);
        CREATE TABLE announcements (
          id UUID PRIMARY KEY,
          group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
          author_id UUID NOT NULL, body TEXT NOT NULL,
          posted_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        );
        CREATE TABLE listings (
          id UUID PRIMARY KEY, slug TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '', description TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL CHECK (category IN {CATEGORIES}),
          parish TEXT NOT NULL CHECK (parish IN {PARISHES}),
          venue TEXT NOT NULL, starts_at TIMESTAMP NOT NULL, ends_at TIMESTAMP NOT NULL,
          admission TEXT NOT NULL CHECK (admission IN ('free','rsvp','ticketed')),
          capacity INTEGER NOT NULL DEFAULT 0 CHECK (capacity >= 0),
          organiser_id UUID NOT NULL REFERENCES organisers(id),
          group_id UUID REFERENCES groups(id) ON DELETE SET NULL,
          featured BOOLEAN NOT NULL DEFAULT FALSE, recurrence TEXT,
          tags TEXT[] NOT NULL DEFAULT '{{}}',
          status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','cancelled')),
          visibility TEXT NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','unlisted')),
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
          updated_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
          CHECK (ends_at > starts_at)
        );
        CREATE INDEX ix_listings_starts ON listings (starts_at) WHERE status = 'published';
        CREATE INDEX ix_listings_organiser ON listings (organiser_id);
        CREATE TABLE ticket_tiers (
          id UUID PRIMARY KEY,
          listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
          name TEXT NOT NULL, price_minor INTEGER NOT NULL CHECK (price_minor >= 0),
          currency TEXT NOT NULL DEFAULT 'XCD' CHECK (currency IN ('XCD','USD')),
          allocation INTEGER NOT NULL DEFAULT 0 CHECK (allocation >= 0),
          sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE rsvps (
          listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
          user_id UUID NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
          PRIMARY KEY (listing_id, user_id)
        );
        CREATE INDEX ix_rsvps_user ON rsvps (user_id);
        CREATE TABLE saved_listings (
          listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
          user_id UUID NOT NULL, PRIMARY KEY (listing_id, user_id)
        );
        CREATE TABLE follows (
          organiser_id UUID NOT NULL REFERENCES organisers(id) ON DELETE CASCADE,
          user_id UUID NOT NULL, PRIMARY KEY (organiser_id, user_id)
        );
        CREATE TABLE connections (
          id UUID PRIMARY KEY, requester_id UUID NOT NULL, addressee_id UUID NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted')),
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
          CHECK (requester_id <> addressee_id)
        );
        CREATE UNIQUE INDEX ux_connections_pair ON connections
          (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
        CREATE TABLE blocks (
          blocker_id UUID NOT NULL, blocked_id UUID NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc'),
          PRIMARY KEY (blocker_id, blocked_id), CHECK (blocker_id <> blocked_id)
        );
        CREATE TABLE reports (
          id UUID PRIMARY KEY, reporter_id UUID NOT NULL,
          subject_type TEXT NOT NULL CHECK (subject_type IN ('profile','message','group','listing')),
          subject_id TEXT NOT NULL, reason TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        );
        CREATE TABLE threads (
          id UUID PRIMARY KEY,
          kind TEXT NOT NULL CHECK (kind IN ('direct','group')),
          group_id UUID UNIQUE REFERENCES groups(id) ON DELETE CASCADE,
          direct_key TEXT UNIQUE,
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        );
        CREATE TABLE thread_participants (
          thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
          user_id UUID NOT NULL, PRIMARY KEY (thread_id, user_id)
        );
        CREATE INDEX ix_thread_participants_user ON thread_participants (user_id);
        CREATE TABLE messages (
          id UUID PRIMARY KEY,
          thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
          author_id UUID NOT NULL, body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
          sent_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        );
        CREATE INDEX ix_messages_thread ON messages (thread_id, sent_at);
        CREATE TABLE suggestions (
          id UUID PRIMARY KEY, submitted_by UUID, title TEXT NOT NULL,
          event_date DATE NOT NULL, start_time TEXT, venue TEXT NOT NULL,
          category TEXT NOT NULL CHECK (category IN {CATEGORIES}),
          parish TEXT NOT NULL CHECK (parish IN {PARISHES}),
          source TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
          created_at TIMESTAMP NOT NULL DEFAULT (now() AT TIME ZONE 'utc')
        );
    """)


def downgrade() -> None:
    op.execute("""
        DROP TABLE IF EXISTS suggestions, messages, thread_participants, threads,
          reports, blocks, connections, follows, saved_listings, rsvps, ticket_tiers,
          listings, announcements, group_members, groups, member_profiles,
          organiser_members, organisers CASCADE;
    """)
