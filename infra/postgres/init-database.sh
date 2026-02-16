#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER app WITH PASSWORD 'changethis';
    CREATE DATABASE app OWNER app;
    GRANT ALL PRIVILEGES ON DATABASE app TO app;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "app" <<-EOSQL
    GRANT ALL ON SCHEMA public TO app;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE USER wxwatch WITH PASSWORD 'changethis';
    CREATE DATABASE wxwatch OWNER wxwatch;
    GRANT ALL PRIVILEGES ON DATABASE wxwatch TO wxwatch;
EOSQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "wxwatch" <<-EOSQL
    GRANT ALL ON SCHEMA public TO wxwatch;
EOSQL
