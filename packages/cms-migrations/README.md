# CMS migration dependencies

This dependency-only package supplies the runtime graph for the existing CMS
migration configuration. It includes Payload, its PostgreSQL and email adapters,
the generated API client, typed environment validation and PostgreSQL client.
Versions use the existing catalog and frozen lockfile. Type-only auth imports do
not require the shared auth package or its Next.js peers at migration runtime.

The CMS Dockerfile builds the API client before `pnpm deploy --legacy --prod`,
then copies the original app config, collections, scripts and migrations. The
shared tsconfig is copied explicitly, as before. There is no alternate schema
or migration command. Add any new runtime config dependency here when extending
the CMS; the image smoke check will reject missing imports.

Before publishing, CI runs Payload's own CLI with
`run scripts/check-migration-runtime.mjs` in the image, with networking disabled
and test-only configuration. It discovers the real config, initializes the
adapter without connecting to the database, and imports every migration module.
The existing database integration tests and staging migration gates still verify
actual execution, repeated migrations and preservation of data.
