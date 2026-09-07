# Admin migration dependencies

This dependency-only workspace defines the production packages needed by the
GAA admin migration, baseline seed and database verification scripts. Versions
come from the root pnpm catalog and frozen lockfile. It is not a second copy of
the migration source.

`apps/web/gaa-admin/Dockerfile` deploys this package into an isolated
`node_modules` directory, then copies the existing app scripts, SQL, seed CSVs
and database source into the migration image. The web runtime continues to use
its own dependency graph. Add any new migration dependency here as well as to
the app if local scripts need it.

The image smoke gate runs
`node --test apps/web/gaa-admin/scripts/migration-runtime.test.mjs` with Docker
networking disabled. These checks load every entrypoint and validate SQL assets;
they do not execute migrations. Database integration tests and staging migration
verification are still required.
