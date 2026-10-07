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

Preserve any additional custom hosts in your own list. CMS uses its own host-only cookie and the ADR-0017 single sign-on handoff; it must have a matching CMS SSO client secret.

These database credentials match the local Compose defaults. Use your configured CMS credentials if overridden. Keep the same secret across restarts to retain sessions. From the devcontainer, use `host.docker.internal` instead of `localhost` for database checks; run the development server on the host.

`cms:setup-db` is idempotent and works with an existing volume. Fresh volumes initialize this database automatically. It never resets existing databases or changes existing role passwords. Sign in through the existing auth app using your FastAPI account. Payload has no local passwords or signup. CMS access is explicitly granted by system administrators in **GAA Admin → Users → Manage → CMS access**. Select an existing Barrels account and save No access, Writer, or Publisher. Employment and department do not determine access.

- **Writer:** create and edit own unpublished content and submit it for review.
- **Publisher:** manage and publish all editorial collections, media, homepage settings and Weather now notes. Publishing still requires the review step.
- **System administrator:** full CMS access, and the only role allowed to grant or remove access. Publishers cannot grant access.

The account must be active with a verified email. CMS permissions are checked with FastAPI on each authenticated request using a CMS-scoped token; that token cannot access GAA staff APIs. Saving a CMS access change revokes the user's CMS sessions, so they must sign in again. Existing JWTs use the live grant and cannot retain revoked or downgraded rights. Other app sessions are preserved.

Apply the additive main-database migration `cmsaccess20261007` before deploying. All non-administrator accounts start with No access; no employment or legacy role is automatically converted into a grant. The legacy Payload role field is retained for storage compatibility but is hidden/read-only and does not grant permissions. `CMS_DEPARTMENT_ID` is retained as a legacy configuration variable and no longer controls admission.

## Write and publish

Each GMS homepage section has its own collection under **Homepage sections**. All of them use the same review workflow, image, link and topic fields.

| Collection | Homepage section | Who publishes |
|---|---|---|
| Desk updates | From the Desk | `cms.publish.desk-updates` |
| Stories | Stories from our atmosphere and ocean | `cms.publish.stories` |
| Questions | Questions about the weather | `cms.publish.questions` |
| Sky, history and fun | On this day, quizzes, Did you know, sky notes | `cms.publish.discover` |
| Report write-ups | Latest reports (each linked to one issued FastAPI report) | `cms.publish.report-notes` |
| Live posts | Weather now feed (updates, YouTube/Facebook video, SoundCloud audio links) | `cms.publish.live-posts` |

1. Create an item in the right collection. The URL is built from the title and date, and fixed once published.
2. Optionally add related links (full HTTP/HTTPS URLs, 20 at most) and topics. Linking does not publish the destination.
3. Save as Draft, then Ready for review.
4. A staff member with that collection's publish permission checks and publishes it.

Questions have an optional science check: a meteorologist ticks it and the site shows "Checked by a GMS meteorologist on <date>". The CMS records who checked it; the public sees only the date.

Tonight's sunrise, sunset and moon phase are calculated by the GMS site; a Sky note only adds an editor's line for a date range. On this day shows today's entry or the nearest within a week; Did you know rotates daily.

Starter content (the first questions, On this day entries, a cloud quiz and five facts) is loaded with `pnpm --filter @barrelsgd/web-cms seed:editorial` as Ready for review, so GMS checks it before publishing. Run it after someone has signed in to the CMS once as an editor or superuser; reruns skip what exists.

**Weather now** (settings page): duty forecasters with `cms.weather-now.note` post a short note that goes live on save, signed and timed automatically, and expires at the next forecast issue (07:00, 12:00 or 18:00) unless they set a time. After it expires the homepage shows the issued forecast summary again. Imagery (satellite, radar) is live data and comes from FastAPI, not the CMS.

**Homepage** (settings page, `cms.homepage.manage`): pin the lead story and up to five questions; choose the Discover cards; hide a section for now (for example during a hurricane). Empty choices show the newest published items.

A note or desk update that uses the words warning, watch or advisory must link to the CAP alert it refers to; otherwise saving is refused. Warnings are issued only in the warning system.

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
