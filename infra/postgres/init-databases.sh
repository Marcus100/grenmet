#!/usr/bin/env bash
# Shared first-boot and explicit provisioning runner. Never rotates passwords.
set -euo pipefail
: "${POSTGRES_USER:?POSTGRES_USER is required}"

create_db() {
  local user="$1" password="$2" db="$3"
  [[ "$user" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ && "$db" =~ ^[a-zA-Z_][a-zA-Z0-9_]*$ ]] || {
    echo "Database and role names must be SQL identifiers" >&2; return 1;
  }
  [[ "$db" != app_test && "$db" != postgres && "$db" != template* ]] || {
    echo "Refusing to provision a reserved or test database" >&2; return 1;
  }
  psql -X -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    --set=domain_user="$user" --set=domain_password="$password" --set=domain_db="$db" <<'SQL'
SELECT pg_advisory_lock(73190507);
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'domain_user', :'domain_password')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'domain_user') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'domain_db', :'domain_user')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'domain_db') \gexec
SELECT pg_get_userbyid(datdba) = :'domain_user' AS correct_owner
FROM pg_database WHERE datname = :'domain_db' \gset
\if :correct_owner
\else
  \echo Existing database owner differs; review required. No ownership was changed.
  DO $$ BEGIN RAISE EXCEPTION 'Existing database owner differs; provisioning rejected'; END $$;
\endif
SELECT pg_advisory_unlock(73190507);
SQL
}

for domain in APP WXWATCH WXPRODUCTS JANITORIAL TRANSPORT CMS; do
  user_key="${domain}_DB_USER"; password_key="${domain}_DB_PASSWORD"; name_key="${domain}_DB_NAME"
  if [[ -z "${!user_key:-}${!password_key:-}${!name_key:-}" ]]; then
    echo "$domain: unconfigured"
    continue
  fi
  [[ -n "${!user_key:-}" && -n "${!password_key:-}" && -n "${!name_key:-}" ]] || {
    echo "$domain: all DB_NAME, DB_USER and DB_PASSWORD values are required" >&2; exit 1;
  }
  create_db "${!user_key}" "${!password_key}" "${!name_key}"
  echo "$domain: provisioned"
done
