# wxwatch (`@grenmet/web-wxwatch`)

Weather image archive for GMS. Port **3002**. Own PostgreSQL database (Drizzle ORM). Requires `pnpm start` (auth session exchange).

Displays scraped satellite and radar images grouped by name and synoptic time. Images are ingested by the Scrapy pipeline in `scripts/scrapy-wxwatch/` — this app is read-only against the DB.

See [CLAUDE.md](./CLAUDE.md) for the database schema, query conventions, and auth pattern.
See [docs/web/development.md](../../../docs/web/development.md) for startup commands.
