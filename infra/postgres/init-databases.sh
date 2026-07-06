#!/usr/bin/env bash
# Runs once on first Postgres volume init (skipped on restarts).
# Creates databases for the app (FastAPI), wxwatch, wxproducts, and janitorial.
set -euo pipefail

create_db() {
  local user="$1" password="$2" db="$3"
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres <<-SQL
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
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-SQL
    GRANT ALL ON SCHEMA public TO "$user";
SQL
}

if [[ -n "${APP_DB_USER:-}" && -n "${APP_DB_PASSWORD:-}" && -n "${APP_DB_NAME:-}" ]]; then
  echo "Creating app database..."
  create_db "$APP_DB_USER" "$APP_DB_PASSWORD" "$APP_DB_NAME"
fi

if [[ -n "${WXWATCH_DB_USER:-}" && -n "${WXWATCH_DB_PASSWORD:-}" && -n "${WXWATCH_DB_NAME:-}" ]]; then
  echo "Creating wxwatch database..."
  create_db "$WXWATCH_DB_USER" "$WXWATCH_DB_PASSWORD" "$WXWATCH_DB_NAME"
fi

if [[ -n "${WXPRODUCTS_DB_USER:-}" && -n "${WXPRODUCTS_DB_PASSWORD:-}" && -n "${WXPRODUCTS_DB_NAME:-}" ]]; then
  echo "Creating wxproducts database..."
  create_db "$WXPRODUCTS_DB_USER" "$WXPRODUCTS_DB_PASSWORD" "$WXPRODUCTS_DB_NAME"
fi

if [[ -n "${JANITORIAL_DB_USER:-}" && -n "${JANITORIAL_DB_PASSWORD:-}" && -n "${JANITORIAL_DB_NAME:-}" ]]; then
  echo "Creating janitorial database..."
  create_db "$JANITORIAL_DB_USER" "$JANITORIAL_DB_PASSWORD" "$JANITORIAL_DB_NAME"
fi
