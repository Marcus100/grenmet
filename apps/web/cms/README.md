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

1. Create Content and choose Latest from us (GMS product-update blog), Weather news (interesting weather stories), or Latest publications (publications and articles). URLs are generated from the section, category, date and title.
2. Write in the rich-text editor. For Latest from us, choose a product category such as Tropical weather outlook, Bulletin, Forecasts, Marine, Aviation or CAP alerts. Older general categories remain available.
3. Optionally add Related links with a title, category and full HTTP/HTTPS URL. Link to existing forecasts, alerts, aviation products, bulletins, publications or news sources. Check that the intended audience can open each destination. Links do not publish the destination or preserve a historical copy. Maximum 20 unique destinations; credentials and executable URLs are rejected.
4. Save as Draft, then Ready for review.
5. A staff member with the section's publication permission checks and publishes the post. Creating an operational product never automatically creates or publishes a blog post.

Authors can edit their own unpublished content. Publication requires the section-specific permission. To return a published item to an author, an authorised editor must change its status to Draft; this removes it from the public API while it is edited. Version history preserves prior content and links. There is no separate live/draft publication workflow or automatic scheduling.

GMS reads anonymous `GET /api/public/content`, which returns only published posts, their section/category and related links. Article pages display the selected section and product category. The feed currently converts rich text to plain text; it does not preserve all rich-text formatting.

## Verification and generated files

```bash
pnpm --filter @barrelsgd/web-cms test
CMS_TEST_DATABASE_URL="$DATABASE_URL" pnpm --filter @barrelsgd/web-cms test
pnpm --filter @barrelsgd/web-cms generate:types
pnpm --filter @barrelsgd/web-cms generate:importmap
```

Database integration tests create and remove an isolated randomly named schema in the CMS database, and are skipped unless `CMS_TEST_DATABASE_URL` is set. Generated types and the admin import map are checked in. Runtime schema push is disabled. Apply `20260923_170000_editorial_links` before deploying the related-links code; it adds live/version link tables and product categories without rewriting older posts. Back up first: destructive rollback is blocked to preserve editorial history. This agent has not applied migrations to operational databases.
