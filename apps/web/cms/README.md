# GMS content trial

Payload at http://localhost:3006/admin, using a dedicated `gms_cms` database and role inside the existing `grenmet-postgres` Docker service. One collection contains articles/blogs and general pages. Weather operations stay in gaa-admin.

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

1. Create Content, choose Article / blog or General page, and enter a title and lowercase URL slug.
2. Write Markdown in the text area; expand Preview to check headings, links, lists, and tables. Raw HTML is not rendered.
3. Save as Draft, then Ready for review.
4. An editor checks the content and saves as Published.

Authors can edit their own unpublished content. Editors manage editorial roles and publication, and can correct or unpublish published content. To return a published item to an author, an editor must change its status to Draft; this removes it from the public API while it is edited. This trial intentionally has no separate live/draft revision workflow, uploads, scheduling, or page builder.

Anonymous `GET /api/content` returns only published items. For example, `/api/content?where[slug][equals]=about-gms`. The existing GMS website is not switched over yet: this trial lets you evaluate the editor and publishing workflow first. A later GMS integration should fetch this public API from the server and render the Markdown safely.

## Verification and generated files

```bash
pnpm --filter @barrelsgd/web-cms test
CMS_TEST_DATABASE_URL="$DATABASE_URL" pnpm --filter @barrelsgd/web-cms test
pnpm --filter @barrelsgd/web-cms generate:types
pnpm --filter @barrelsgd/web-cms generate:importmap
```

Database integration tests create and remove an isolated randomly named schema in the CMS database, and are skipped unless `CMS_TEST_DATABASE_URL` is set. Generated types and the admin import map are checked in. Development uses Payload's schema push; production deployment will need reviewed migrations, persistent credentials, and configured shared-cookie/return-host settings.
