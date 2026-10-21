"""Barrels Events moves into the main database as the ``events`` schema (ADR-0003).

Nothing was live in the separate Events database, so there is no data copy: this
creates the final shape of the former ``events_0001`` to ``events_0010`` chain
(organisers, listings, groups, messaging, tickets, orders, admissions, tills,
refunds, the append-only activity log). The Events-only ``outbox`` table is not
recreated: Events uses the platform outbox (``platform.outbox``).

Users, organisations and payment intents are referenced by plain ids, as before.

ONE-WAY: restore from backup to go back. The downgrade drops the whole ``events``
schema with ``CASCADE`` and every Events row in it. It exists only so the
migration rehearsal tests can step through it. Never use it on real data.

Revision ID: eventsschema20261021
Revises: webhooksout20261020
"""

from alembic import op

revision = "eventsschema20261021"
down_revision = "webhooksout20261020"
branch_labels = None
depends_on = None

EVENTS_SCHEMA_SQL = """
CREATE FUNCTION events.activity_is_append_only() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
          RAISE EXCEPTION 'activity is append-only';
        END;
        $$;
CREATE TABLE events.activity (
    id uuid NOT NULL,
    organiser_id uuid,
    entity_type text NOT NULL,
    entity_id text NOT NULL,
    action text NOT NULL,
    actor_id uuid NOT NULL,
    summary jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);
CREATE TABLE events.admissions (
    id uuid NOT NULL,
    ticket_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    admitted_by uuid NOT NULL,
    admitted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    method text DEFAULT 'qr'::text NOT NULL,
    idempotency_key text
);
CREATE TABLE events.announcements (
    id uuid NOT NULL,
    group_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    posted_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);
CREATE TABLE events.blocks (
    blocker_id uuid NOT NULL,
    blocked_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT blocks_check CHECK ((blocker_id <> blocked_id))
);
CREATE TABLE events.connections (
    id uuid NOT NULL,
    requester_id uuid NOT NULL,
    addressee_id uuid NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT connections_check CHECK ((requester_id <> addressee_id)),
    CONSTRAINT connections_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text])))
);
CREATE TABLE events.follows (
    organiser_id uuid NOT NULL,
    user_id uuid NOT NULL
);
CREATE TABLE events.group_members (
    group_id uuid NOT NULL,
    user_id uuid NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    joined_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT group_members_role_check CHECK ((role = ANY (ARRAY['host'::text, 'member'::text]))),
    CONSTRAINT group_members_status_check CHECK ((status = ANY (ARRAY['active'::text, 'pending'::text])))
);
CREATE TABLE events.groups (
    id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    tagline text DEFAULT ''::text NOT NULL,
    about text DEFAULT ''::text NOT NULL,
    category text NOT NULL,
    parish text NOT NULL,
    join_policy text DEFAULT 'open'::text NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT groups_category_check CHECK ((category = ANY (ARRAY['fete'::text, 'music'::text, 'food'::text, 'sport'::text, 'business'::text, 'tech'::text, 'culture'::text, 'faith'::text, 'family'::text, 'wellness'::text]))),
    CONSTRAINT groups_join_policy_check CHECK ((join_policy = ANY (ARRAY['open'::text, 'approval'::text]))),
    CONSTRAINT groups_parish_check CHECK ((parish = ANY (ARRAY['st-george'::text, 'st-andrew'::text, 'st-david'::text, 'st-patrick'::text, 'st-mark'::text, 'st-john'::text, 'carriacou'::text])))
);
CREATE TABLE events.listings (
    id uuid NOT NULL,
    slug text NOT NULL,
    title text NOT NULL,
    summary text DEFAULT ''::text NOT NULL,
    description text DEFAULT ''::text NOT NULL,
    category text NOT NULL,
    parish text NOT NULL,
    venue text NOT NULL,
    starts_at timestamp without time zone NOT NULL,
    ends_at timestamp without time zone NOT NULL,
    admission text NOT NULL,
    capacity integer DEFAULT 0 NOT NULL,
    organiser_id uuid NOT NULL,
    group_id uuid,
    featured boolean DEFAULT false NOT NULL,
    recurrence text,
    tags text[] DEFAULT '{}'::text[] NOT NULL,
    status text DEFAULT 'draft'::text NOT NULL,
    visibility text DEFAULT 'public'::text NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    image_file_id uuid,
    CONSTRAINT listings_admission_check CHECK ((admission = ANY (ARRAY['free'::text, 'rsvp'::text, 'ticketed'::text]))),
    CONSTRAINT listings_capacity_check CHECK ((capacity >= 0)),
    CONSTRAINT listings_category_check CHECK ((category = ANY (ARRAY['fete'::text, 'music'::text, 'food'::text, 'sport'::text, 'business'::text, 'tech'::text, 'culture'::text, 'faith'::text, 'family'::text, 'wellness'::text]))),
    CONSTRAINT listings_check CHECK ((ends_at > starts_at)),
    CONSTRAINT listings_parish_check CHECK ((parish = ANY (ARRAY['st-george'::text, 'st-andrew'::text, 'st-david'::text, 'st-patrick'::text, 'st-mark'::text, 'st-john'::text, 'carriacou'::text]))),
    CONSTRAINT listings_status_check CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'cancelled'::text]))),
    CONSTRAINT listings_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'unlisted'::text])))
);
CREATE TABLE events.member_profiles (
    user_id uuid NOT NULL,
    handle text NOT NULL,
    display_name text NOT NULL,
    headline text DEFAULT ''::text NOT NULL,
    bio text DEFAULT ''::text NOT NULL,
    parish text DEFAULT 'st-george'::text NOT NULL,
    interests text[] DEFAULT '{}'::text[] NOT NULL,
    intents text[] DEFAULT '{}'::text[] NOT NULL,
    visibility text DEFAULT 'public'::text NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    updated_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT member_profiles_parish_check CHECK ((parish = ANY (ARRAY['st-george'::text, 'st-andrew'::text, 'st-david'::text, 'st-patrick'::text, 'st-mark'::text, 'st-john'::text, 'carriacou'::text]))),
    CONSTRAINT member_profiles_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'connections'::text])))
);
CREATE TABLE events.messages (
    id uuid NOT NULL,
    thread_id uuid NOT NULL,
    author_id uuid NOT NULL,
    body text NOT NULL,
    sent_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT messages_body_check CHECK (((length(body) >= 1) AND (length(body) <= 4000)))
);
CREATE TABLE events.order_items (
    id uuid NOT NULL,
    order_id uuid NOT NULL,
    tier_id uuid NOT NULL,
    quantity integer NOT NULL,
    unit_price_minor integer DEFAULT 0 NOT NULL,
    CONSTRAINT order_items_quantity_check CHECK ((quantity > 0))
);
CREATE TABLE events.orders (
    id uuid NOT NULL,
    listing_id uuid NOT NULL,
    user_id uuid,
    status text DEFAULT 'confirmed'::text NOT NULL,
    total_minor integer DEFAULT 0 NOT NULL,
    currency text DEFAULT 'XCD'::text NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    channel text DEFAULT 'online'::text NOT NULL,
    payment_method text DEFAULT 'none'::text NOT NULL,
    collected_minor integer DEFAULT 0 NOT NULL,
    buyer_name text,
    buyer_phone text,
    sold_by uuid,
    till_session_id uuid,
    idempotency_key text,
    payment_intent_id uuid,
    payment_expires_at timestamp without time zone,
    paid_at timestamp without time zone,
    refunded_minor integer DEFAULT 0 NOT NULL,
    CONSTRAINT ck_orders_channel_user CHECK (((channel = 'online'::text) = (user_id IS NOT NULL))),
    CONSTRAINT orders_channel_check CHECK ((channel = ANY (ARRAY['online'::text, 'outlet'::text]))),
    CONSTRAINT orders_payment_method_check CHECK ((payment_method = ANY (ARRAY['none'::text, 'cash_outlet'::text, 'online'::text])))
);
CREATE TABLE events.organiser_members (
    organiser_id uuid NOT NULL,
    user_id uuid NOT NULL
);
CREATE TABLE events.organisers (
    id uuid NOT NULL,
    slug text NOT NULL,
    name text NOT NULL,
    bio text DEFAULT ''::text NOT NULL,
    verified boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    organisation_id text,
    logo_file_id uuid
);
CREATE TABLE events.refunds (
    id uuid NOT NULL,
    listing_id uuid NOT NULL,
    order_id uuid NOT NULL,
    ticket_id uuid NOT NULL,
    amount_minor integer NOT NULL,
    method text NOT NULL,
    reference text,
    refunded_by uuid NOT NULL,
    refunded_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    till_session_id uuid,
    CONSTRAINT refunds_amount_minor_check CHECK ((amount_minor > 0)),
    CONSTRAINT refunds_method_check CHECK ((method = ANY (ARRAY['cash'::text, 'bank'::text])))
);
CREATE TABLE events.reports (
    id uuid NOT NULL,
    reporter_id uuid NOT NULL,
    subject_type text NOT NULL,
    subject_id text NOT NULL,
    reason text NOT NULL,
    status text DEFAULT 'open'::text NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'actioned'::text, 'dismissed'::text]))),
    CONSTRAINT reports_subject_type_check CHECK ((subject_type = ANY (ARRAY['profile'::text, 'message'::text, 'group'::text, 'listing'::text])))
);
CREATE TABLE events.rsvps (
    listing_id uuid NOT NULL,
    user_id uuid NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL
);
CREATE TABLE events.saved_listings (
    listing_id uuid NOT NULL,
    user_id uuid NOT NULL
);
CREATE TABLE events.suggestions (
    id uuid NOT NULL,
    submitted_by uuid,
    title text NOT NULL,
    event_date date NOT NULL,
    start_time text,
    venue text NOT NULL,
    category text NOT NULL,
    parish text NOT NULL,
    source text DEFAULT ''::text NOT NULL,
    notes text DEFAULT ''::text NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT suggestions_category_check CHECK ((category = ANY (ARRAY['fete'::text, 'music'::text, 'food'::text, 'sport'::text, 'business'::text, 'tech'::text, 'culture'::text, 'faith'::text, 'family'::text, 'wellness'::text]))),
    CONSTRAINT suggestions_parish_check CHECK ((parish = ANY (ARRAY['st-george'::text, 'st-andrew'::text, 'st-david'::text, 'st-patrick'::text, 'st-mark'::text, 'st-john'::text, 'carriacou'::text]))),
    CONSTRAINT suggestions_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);
CREATE TABLE events.thread_participants (
    thread_id uuid NOT NULL,
    user_id uuid NOT NULL
);
CREATE TABLE events.threads (
    id uuid NOT NULL,
    kind text NOT NULL,
    group_id uuid,
    direct_key text,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    CONSTRAINT threads_kind_check CHECK ((kind = ANY (ARRAY['direct'::text, 'group'::text])))
);
CREATE TABLE events.ticket_tiers (
    id uuid NOT NULL,
    listing_id uuid NOT NULL,
    name text NOT NULL,
    price_minor integer NOT NULL,
    currency text DEFAULT 'XCD'::text NOT NULL,
    allocation integer DEFAULT 0 NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    per_account_limit integer DEFAULT 4 NOT NULL,
    CONSTRAINT ticket_tiers_allocation_check CHECK ((allocation >= 0)),
    CONSTRAINT ticket_tiers_currency_check CHECK ((currency = ANY (ARRAY['XCD'::text, 'USD'::text]))),
    CONSTRAINT ticket_tiers_per_account_limit_check CHECK (((per_account_limit >= 1) AND (per_account_limit <= 50))),
    CONSTRAINT ticket_tiers_price_minor_check CHECK ((price_minor >= 0))
);
CREATE TABLE events.tickets (
    id uuid NOT NULL,
    order_id uuid NOT NULL,
    listing_id uuid NOT NULL,
    tier_id uuid NOT NULL,
    user_id uuid,
    code text NOT NULL,
    status text DEFAULT 'valid'::text NOT NULL,
    created_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    cancelled_at timestamp without time zone
);
CREATE TABLE events.till_sessions (
    id uuid NOT NULL,
    listing_id uuid NOT NULL,
    staff_id uuid NOT NULL,
    day date NOT NULL,
    opening_float_minor integer NOT NULL,
    opened_at timestamp without time zone DEFAULT (now() AT TIME ZONE 'utc'::text) NOT NULL,
    closed_at timestamp without time zone,
    counted_minor integer,
    close_note text,
    CONSTRAINT ck_till_closed CHECK (((closed_at IS NULL) = (counted_minor IS NULL))),
    CONSTRAINT till_sessions_counted_minor_check CHECK ((counted_minor >= 0)),
    CONSTRAINT till_sessions_opening_float_minor_check CHECK ((opening_float_minor >= 0))
);
ALTER TABLE ONLY events.activity
    ADD CONSTRAINT activity_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.admissions
    ADD CONSTRAINT admissions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.admissions
    ADD CONSTRAINT admissions_ticket_id_key UNIQUE (ticket_id);
ALTER TABLE ONLY events.announcements
    ADD CONSTRAINT announcements_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.blocks
    ADD CONSTRAINT blocks_pkey PRIMARY KEY (blocker_id, blocked_id);
ALTER TABLE ONLY events.connections
    ADD CONSTRAINT connections_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (organiser_id, user_id);
ALTER TABLE ONLY events.group_members
    ADD CONSTRAINT group_members_pkey PRIMARY KEY (group_id, user_id);
ALTER TABLE ONLY events.groups
    ADD CONSTRAINT groups_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.groups
    ADD CONSTRAINT groups_slug_key UNIQUE (slug);
ALTER TABLE ONLY events.listings
    ADD CONSTRAINT listings_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.listings
    ADD CONSTRAINT listings_slug_key UNIQUE (slug);
ALTER TABLE ONLY events.member_profiles
    ADD CONSTRAINT member_profiles_handle_key UNIQUE (handle);
ALTER TABLE ONLY events.member_profiles
    ADD CONSTRAINT member_profiles_pkey PRIMARY KEY (user_id);
ALTER TABLE ONLY events.messages
    ADD CONSTRAINT messages_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.order_items
    ADD CONSTRAINT order_items_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.orders
    ADD CONSTRAINT orders_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.organiser_members
    ADD CONSTRAINT organiser_members_pkey PRIMARY KEY (organiser_id, user_id);
ALTER TABLE ONLY events.organisers
    ADD CONSTRAINT organisers_organisation_id_key UNIQUE (organisation_id);
ALTER TABLE ONLY events.organisers
    ADD CONSTRAINT organisers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.organisers
    ADD CONSTRAINT organisers_slug_key UNIQUE (slug);
ALTER TABLE ONLY events.refunds
    ADD CONSTRAINT refunds_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.refunds
    ADD CONSTRAINT refunds_ticket_id_key UNIQUE (ticket_id);
ALTER TABLE ONLY events.reports
    ADD CONSTRAINT reports_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.rsvps
    ADD CONSTRAINT rsvps_pkey PRIMARY KEY (listing_id, user_id);
ALTER TABLE ONLY events.saved_listings
    ADD CONSTRAINT saved_listings_pkey PRIMARY KEY (listing_id, user_id);
ALTER TABLE ONLY events.suggestions
    ADD CONSTRAINT suggestions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.thread_participants
    ADD CONSTRAINT thread_participants_pkey PRIMARY KEY (thread_id, user_id);
ALTER TABLE ONLY events.threads
    ADD CONSTRAINT threads_direct_key_key UNIQUE (direct_key);
ALTER TABLE ONLY events.threads
    ADD CONSTRAINT threads_group_id_key UNIQUE (group_id);
ALTER TABLE ONLY events.threads
    ADD CONSTRAINT threads_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.ticket_tiers
    ADD CONSTRAINT ticket_tiers_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.tickets
    ADD CONSTRAINT tickets_code_key UNIQUE (code);
ALTER TABLE ONLY events.tickets
    ADD CONSTRAINT tickets_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.till_sessions
    ADD CONSTRAINT till_sessions_pkey PRIMARY KEY (id);
ALTER TABLE ONLY events.till_sessions
    ADD CONSTRAINT ux_till_staff_day UNIQUE (listing_id, staff_id, day);
CREATE INDEX ix_activity_entity ON events.activity USING btree (entity_type, entity_id, created_at DESC);
CREATE INDEX ix_activity_organiser ON events.activity USING btree (organiser_id, created_at DESC);
CREATE INDEX ix_admissions_listing ON events.admissions USING btree (listing_id, admitted_at);
CREATE INDEX ix_group_members_user ON events.group_members USING btree (user_id);
CREATE INDEX ix_listings_organiser ON events.listings USING btree (organiser_id);
CREATE INDEX ix_listings_starts ON events.listings USING btree (starts_at) WHERE (status = 'published'::text);
CREATE INDEX ix_messages_thread ON events.messages USING btree (thread_id, sent_at);
CREATE INDEX ix_order_items_order ON events.order_items USING btree (order_id);
CREATE INDEX ix_orders_listing ON events.orders USING btree (listing_id);
CREATE INDEX ix_orders_payment_intent ON events.orders USING btree (payment_intent_id) WHERE (payment_intent_id IS NOT NULL);
CREATE INDEX ix_orders_pending_expiry ON events.orders USING btree (payment_expires_at) WHERE (status = 'pending_payment'::text);
CREATE INDEX ix_orders_till ON events.orders USING btree (till_session_id);
CREATE INDEX ix_orders_user ON events.orders USING btree (user_id, created_at DESC);
CREATE INDEX ix_refunds_listing ON events.refunds USING btree (listing_id, refunded_at);
CREATE INDEX ix_refunds_till ON events.refunds USING btree (till_session_id);
CREATE INDEX ix_rsvps_user ON events.rsvps USING btree (user_id);
CREATE INDEX ix_thread_participants_user ON events.thread_participants USING btree (user_id);
CREATE INDEX ix_tickets_listing ON events.tickets USING btree (listing_id, status);
CREATE INDEX ix_tickets_tier_status ON events.tickets USING btree (tier_id, status);
CREATE INDEX ix_tickets_user_tier ON events.tickets USING btree (user_id, tier_id, status);
CREATE UNIQUE INDEX ux_admissions_key ON events.admissions USING btree (listing_id, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE UNIQUE INDEX ux_connections_pair ON events.connections USING btree (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id));
CREATE UNIQUE INDEX ux_orders_online_key ON events.orders USING btree (listing_id, user_id, idempotency_key) WHERE ((channel = 'online'::text) AND (idempotency_key IS NOT NULL));
CREATE UNIQUE INDEX ux_orders_outlet_key ON events.orders USING btree (listing_id, sold_by, idempotency_key) WHERE (idempotency_key IS NOT NULL);
CREATE TRIGGER activity_append_only BEFORE DELETE OR UPDATE ON events.activity FOR EACH ROW EXECUTE FUNCTION events.activity_is_append_only();
ALTER TABLE ONLY events.admissions
    ADD CONSTRAINT admissions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES events.listings(id);
ALTER TABLE ONLY events.admissions
    ADD CONSTRAINT admissions_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES events.tickets(id);
ALTER TABLE ONLY events.announcements
    ADD CONSTRAINT announcements_group_id_fkey FOREIGN KEY (group_id) REFERENCES events.groups(id) ON DELETE CASCADE;
ALTER TABLE ONLY events.follows
    ADD CONSTRAINT follows_organiser_id_fkey FOREIGN KEY (organiser_id) REFERENCES events.organisers(id) ON DELETE CASCADE;
ALTER TABLE ONLY events.group_members
    ADD CONSTRAINT group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES events.groups(id) ON DELETE CASCADE;
ALTER TABLE ONLY events.listings
    ADD CONSTRAINT listings_group_id_fkey FOREIGN KEY (group_id) REFERENCES events.groups(id) ON DELETE SET NULL;
ALTER TABLE ONLY events.listings
    ADD CONSTRAINT listings_organiser_id_fkey FOREIGN KEY (organiser_id) REFERENCES events.organisers(id);
ALTER TABLE ONLY events.messages
    ADD CONSTRAINT messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES events.threads(id) ON DELETE CASCADE;
ALTER TABLE ONLY events.order_items
    ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES events.orders(id);
ALTER TABLE ONLY events.order_items
    ADD CONSTRAINT order_items_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES events.ticket_tiers(id);
ALTER TABLE ONLY events.orders
    ADD CONSTRAINT orders_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES events.listings(id);
ALTER TABLE ONLY events.orders
    ADD CONSTRAINT orders_till_session_id_fkey FOREIGN KEY (till_session_id) REFERENCES events.till_sessions(id);
ALTER TABLE ONLY events.organiser_members
    ADD CONSTRAINT organiser_members_organiser_id_fkey FOREIGN KEY (organiser_id) REFERENCES events.organisers(id) ON DELETE CASCADE;
ALTER TABLE ONLY events.refunds
    ADD CONSTRAINT refunds_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES events.listings(id);
ALTER TABLE ONLY events.refunds
    ADD CONSTRAINT refunds_order_id_fkey FOREIGN KEY (order_id) REFERENCES events.orders(id);
ALTER TABLE ONLY events.refunds
    ADD CONSTRAINT refunds_ticket_id_fkey FOREIGN KEY (ticket_id) REFERENCES events.tickets(id);
ALTER TABLE ONLY events.refunds
    ADD CONSTRAINT refunds_till_session_id_fkey FOREIGN KEY (till_session_id) REFERENCES events.till_sessions(id);
ALTER TABLE ONLY events.rsvps
    ADD CONSTRAINT rsvps_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES events.listings(id) ON DELETE CASCADE;
ALTER TABLE ONLY events.saved_listings
    ADD CONSTRAINT saved_listings_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES events.listings(id) ON DELETE CASCADE;
ALTER TABLE ONLY events.thread_participants
    ADD CONSTRAINT thread_participants_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES events.threads(id) ON DELETE CASCADE;
ALTER TABLE ONLY events.threads
    ADD CONSTRAINT threads_group_id_fkey FOREIGN KEY (group_id) REFERENCES events.groups(id) ON DELETE CASCADE;
ALTER TABLE ONLY events.ticket_tiers
    ADD CONSTRAINT ticket_tiers_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES events.listings(id) ON DELETE CASCADE;
ALTER TABLE ONLY events.tickets
    ADD CONSTRAINT tickets_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES events.listings(id);
ALTER TABLE ONLY events.tickets
    ADD CONSTRAINT tickets_order_id_fkey FOREIGN KEY (order_id) REFERENCES events.orders(id);
ALTER TABLE ONLY events.tickets
    ADD CONSTRAINT tickets_tier_id_fkey FOREIGN KEY (tier_id) REFERENCES events.ticket_tiers(id);
ALTER TABLE ONLY events.till_sessions
    ADD CONSTRAINT till_sessions_listing_id_fkey FOREIGN KEY (listing_id) REFERENCES events.listings(id);
"""


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS events")
    op.execute(EVENTS_SCHEMA_SQL)


def downgrade() -> None:
    op.execute("DROP SCHEMA IF EXISTS events CASCADE")
