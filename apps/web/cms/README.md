# GMS content trial

Payload at http://localhost:3006/admin, using a dedicated `gms_cms` database and role inside the existing `grenmet-postgres` Docker service. Each homepage section has its own collection. Weather operations stay in gaa-admin.

## Start on the host

With the normal Docker stack running (`pnpm start`), run from the repository root:

```bash
pnpm cms:setup-db
export DATABASE_URL='postgresql://gms_cms:changethis@localhost:5432/gms_cms'
# Set AUTH_API_URL too if FastAPI is not at http://localhost:8000.
export PAYLOAD_SECRET="$(openssl rand -hex 32)"
pnpm dev:web:cms
```

The auth app must allow `localhost:3006` for the post-login redirect. Restart the auth development server on the host with the existing local entries plus CMS:

```bash
AUTH_ALLOWED_RETURN_HOSTS=localhost:3001,localhost:3002,localhost:3003,localhost:3004,localhost:3006 pnpm dev:web:auth
```

Preserve any additional custom hosts in your own list. In deployment, the CMS and auth app must share the configured session-cookie domain.

These database credentials match the local Compose defaults. Use your configured CMS credentials if overridden. Keep the same secret across restarts to retain sessions. From the devcontainer, use `host.docker.internal` instead of `localhost` for database checks; run the development server on the host.

`cms:setup-db` is idempotent and works with an existing volume. Fresh volumes initialize this database automatically. It never resets existing databases or changes existing role passwords. Sign in through the existing auth app using your FastAPI account. Payload has no local passwords or signup. Active staff in the GMS department become authors automatically; FastAPI superusers can open Staff and designate editors after their first sign-in. The username, email, active status, and staff membership are checked with FastAPI on every authenticated request. The CMS stores only a staff reference and its editorial role.

## Write and publish

Each GMS homepage section has its own collection under **Homepage sections**. All of them use the same review workflow, image, link and topic fields.

| Collection | Homepage section | Who publishes |
|---|---|---|
| Desk updates | From the Desk | `cms.publish.desk-updates` |
| Stories | Stories from our atmosphere and ocean | `cms.publish.stories` |
| Questions | Questions about the weather | `cms.publish.questions` |
| Publications | Latest reports (document required) | `cms.publish.publications` |

1. Create an item in the right collection. The URL is built from the title and date, and fixed once published.
2. Optionally add related links (full HTTP/HTTPS URLs, 20 at most) and topics. Linking does not publish the destination.
3. Save as Draft, then Ready for review.
4. A staff member with that collection's publish permission checks and publishes it.

Questions have an optional science check: a meteorologist ticks it and the site shows "Checked by a GMS meteorologist on <date>". The CMS records who checked it; the public sees only the date.

Starter content (the first questions) is loaded with `pnpm --filter @barrelsgd/web-cms seed:editorial` as Ready for review, so GMS checks it before publishing. Run it after someone has signed in to the CMS once as an editor or superuser; reruns skip what exists.

Desk updates are notices about products and services. Forecasts and warnings are issued only in the forecast and warning systems, never here.

Authors edit their own unpublished items. Editors (`cms.article.edit.all`) edit everything. Version history keeps earlier copies.

GMS reads anonymous `GET /api/public/home` for the homepage and `GET /api/public/articles` for lists and article pages. Both return published items only, never staff fields. Rich text is converted to plain paragraphs.

## Verification and generated files

```bash
pnpm --filter @barrelsgd/web-cms test
CMS_TEST_DATABASE_URL="$DATABASE_URL" pnpm --filter @barrelsgd/web-cms test
pnpm --filter @barrelsgd/web-cms generate:types
pnpm --filter @barrelsgd/web-cms generate:importmap
```

Database integration tests create and remove an isolated randomly named schema in the CMS database, and are skipped unless `CMS_TEST_DATABASE_URL` is set. Generated types and the admin import map are checked in. Runtime schema push is disabled. Apply `20260929_210000_editorial_collections` before deploying this code. It replaces the old single Content collection and **deletes its posts** (cleared by decision on 29 Sep 2026), then creates the new collections. Back up first: destructive rollback is blocked to preserve editorial history. This agent has not applied migrations to operational databases.
