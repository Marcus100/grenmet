#!/usr/bin/env bash
# Keep the existing administrator/owner role; create a separate runtime login.
set -euo pipefail
: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}" "${FASTAPI_DB_USER:?}" "${FASTAPI_DB_PASSWORD:?}"
[[ "$FASTAPI_DB_USER" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ && "$FASTAPI_DB_USER" != "$POSTGRES_USER" ]] || {
  echo "FastAPI runtime role must be a distinct SQL identifier" >&2; exit 1;
}
# Suppress raw SQL errors: CREATE ROLE statements can contain the password.
if ! psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" \
  --set=runtime_role="$FASTAPI_DB_USER" --set=runtime_password="$FASTAPI_DB_PASSWORD" \
  >/dev/null 2>&1 <<'SQL'
BEGIN;
SELECT pg_advisory_xact_lock(73190506);
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD %L', :'runtime_role', :'runtime_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'runtime_role') \gexec
SELECT NOT (rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
AND rolcanlogin
AND NOT EXISTS (SELECT 1 FROM pg_auth_members WHERE member = r.oid)
AND NOT EXISTS (SELECT 1 FROM pg_database WHERE datdba = r.oid)
AND NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspowner = r.oid)
AS safe_runtime FROM pg_roles r WHERE rolname = :'runtime_role' \gset
\if :safe_runtime
\else
  DO $$ BEGIN RAISE EXCEPTION 'Unsafe runtime role; grants rejected'; END $$;
\endif
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'runtime_role') \gexec
SELECT format('GRANT USAGE ON SCHEMA %I TO %I', nspname, :'runtime_role')
FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' \gexec
SELECT format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA %I TO %I', nspname, :'runtime_role')
FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I', nspname, :'runtime_role')
FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname <> 'information_schema' \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', current_user, :'runtime_role') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I GRANT USAGE, SELECT ON SEQUENCES TO %I', current_user, :'runtime_role') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES FOR ROLE %I GRANT USAGE ON SCHEMAS TO %I', current_user, :'runtime_role') \gexec
SELECT format('REVOKE INSERT, UPDATE, DELETE ON public.alembic_version FROM %I', :'runtime_role') \gexec
COMMIT;
SQL
then
  echo "FastAPI runtime grants failed; review role attributes and migration ownership. No grants committed." >&2
  exit 1
fi
# Authenticate as the runtime login too: never silently rotate an existing password.
if ! PGPASSWORD="$FASTAPI_DB_PASSWORD" psql -X -q -h "${PGHOST:-127.0.0.1}" -U "$FASTAPI_DB_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 \
  -c 'SELECT version_num FROM alembic_version; SELECT id FROM "user" LIMIT 0; SELECT id FROM hr.department LIMIT 0' >/dev/null 2>&1; then
  echo "FastAPI runtime login/schema verification failed; applications must not start" >&2
  exit 1
fi
echo "FastAPI runtime login and schema access verified; administrator role preserved"
