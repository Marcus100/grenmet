#!/usr/bin/env bash
# Runs once on first Postgres volume init (skipped on restarts).
# Creates additional databases for wxwatch and wxproducts.
set -euo pipefail

create_db() {
  local user="$1" password="$2" db="$3"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-SQL
    DO \$\$
    BEGIN
      IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = '$user') THEN
        CREATE ROLE "$user" WITH LOGIN PASSWORD '$password';
      END IF;
    END
    \$\$;
    SELECT 'CREATE DATABASE "$db" OWNER "$user"'
    WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db') \gexec
    GRANT ALL PRIVILEGES ON DATABASE "$db" TO "$user";
SQL
}

if [[ -n "${WXWATCH_DB_NAME:-}" && -n "${WXWATCH_DB_USER:-}" && -n "${WXWATCH_DB_PASSWORD:-}" ]]; then
  echo "Creating wxwatch database..."
  create_db "$WXWATCH_DB_USER" "$WXWATCH_DB_PASSWORD" "$WXWATCH_DB_NAME"
fi

if [[ -n "${WXPRODUCTS_DB_NAME:-}" && -n "${WXPRODUCTS_DB_USER:-}" && -n "${WXPRODUCTS_DB_PASSWORD:-}" ]]; then
  echo "Creating wxproducts database..."
  create_db "$WXPRODUCTS_DB_USER" "$WXPRODUCTS_DB_PASSWORD" "$WXPRODUCTS_DB_NAME"
fi
