#!/usr/bin/env bash
# Safe to rerun against an existing volume; does not reset databases or passwords.
set -euo pipefail
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  --set=cms_user="${CMS_DB_USER:-gms_cms}" \
  --set=cms_password="${CMS_DB_PASSWORD:-changethis}" \
  --set=cms_db="${CMS_DB_NAME:-gms_cms}" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'cms_user', :'cms_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'cms_user') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'cms_db', :'cms_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'cms_db') \gexec
SQL
