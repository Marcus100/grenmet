# events domain — agent context

**Owner:** Barrels product (Barrels Events, `apps/web/events`; PWA `apps/pwa/pwa-events` next). Not a GAA/GMS module.

- Separate, self-contained database with its own Alembic history (`alembic.ini`, `migrations/`, revisions `events_NNNN`, version table `events_alembic_version`). People are auth `user_id` UUIDs; never a cross-database FK. Migrations are hand-written SQL and **additive**; models in `models.py` on `events_metadata` mirror them (never autogenerate).
- `EVENTS_DATABASE_URL` is optional when running the API alone; `/events` routes return 503 while unset. The deployed Events website requires its database, so core delivery validates `EVENTS_DB_PASSWORD` before provisioning/migration.
- Auth is app-scoped (ADR-0016): member routes use `EventsMember` (`app_user("events")`), public reads use `EventsViewer` (optional). Staff tokens are refused here; Events tokens are refused on staff routes. Organiser routes need `events.organiser.manage` **and** `organiser_members` membership; moderation needs `events.moderate`.
- `listings` is the event table (avoids clashing with "event" elsewhere). Only `status='published'` + `visibility='public'` appear in lists; unlisted published listings open by slug.
- Safety rules live in `service.py` and must hold for every client: DMs only between accepted connections or shared active group members (`can_message`, re-checked on every send); blocks hide both people from each other (profiles 404, going previews, members, messages) and drop any connection; `visibility='connections'` profiles expose only name/headline outside the network; join requests to `approval` groups stay `pending` with no chat access.
- Times are stored naive UTC; `when` windows (`tonight`/`weekend`/`week`/`month`) use Grenada calendar days (UTC−4, no DST).
- Tests: `tests/events/test_events_api.py` (disposable migrated DB via `fresh_weather_engine`; overrides `deps.get_session`, `deps.require_member`, `deps.optional_member`, `deps.require_organiser`). Auth flows: `tests/auth/test_app_scoped.py`.
- Related: ADR-0003, ADR-0016, `docs/products/barrels-events-v1-definition.md`.
