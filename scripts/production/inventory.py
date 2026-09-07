#!/usr/bin/env python3
"""Read-only configured and actual storage inventory. Output is an allowlist."""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ["infra/docker/docker-compose.yml", "infra/docker/docker-compose.deploy.yml", "apps/api/fastapi/docker-compose.yml", "surface/docker-compose.yml", "wis2box/docker-compose.yml", "wis2box/docker-compose.monitoring.yml", "infra/weather/docker-compose.surface.yml", "infra/weather/docker-compose.wis2box.yml", "infra/weather/docker-compose.proxy.yml"]


def capture(args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("Inventory command unavailable; run on the configured Docker host")
    return result.stdout


def configured():
    for relative in COMPOSE:
        try:
            model = json.loads(capture(["docker", "compose", "-f", str(ROOT / relative), "config", "--no-interpolate", "--no-env-resolution", "--no-consistency", "--format", "json"]))
            print(json.dumps({"compose": relative, "services": {
                key: {"image": value.get("image"), "environment_keys": sorted(key.split("=", 1)[0] for key in value.get("environment", {})),
                      "volumes": [{field: mount.get(field) for field in ["type", "source", "target"]} for mount in value.get("volumes", [])],
                      "healthcheck": bool(value.get("healthcheck"))}
                for key, value in model.get("services", {}).items()}, "volumes": list(model.get("volumes", {}))}))
        except RuntimeError:
            print(json.dumps({"compose": relative, "status": "configuration unavailable"}))


def database_inventory(container):
    def sql(database, statement):
        return capture(["docker", "exec", container, "sh", "-c", 'exec psql -X -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" -Atc "$2"', "sh", database, statement]).strip()
    databases = sql("postgres", "SELECT datname FROM pg_database WHERE NOT datistemplate ORDER BY datname").splitlines()
    for database in databases:
        if database == "postgres":
            continue
        info = {"database": database, "owner": sql(database, "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname = current_database()"), "engine": sql(database, "SHOW server_version"), "extensions": sql(database, "SELECT extname || ':' || extversion FROM pg_extension ORDER BY extname")}
        for relation, query in [
            ("public.alembic_version", "SELECT version_num FROM alembic_version"),
            ("drizzle.__drizzle_migrations", "SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at"),
            ("public.payload_migrations", "SELECT name || ':' || batch FROM payload_migrations ORDER BY id"),
            ("public.django_migrations", "SELECT app || ':' || name FROM django_migrations ORDER BY app, name"),
            ("public.baseline_step", "SELECT key FROM baseline_step ORDER BY key"),
        ]:
            if sql(database, f"SELECT to_regclass('{relation}') IS NOT NULL") == "t":
                info[relation] = sql(database, query).splitlines()
        print(json.dumps(info))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--configured-only", action="store_true")
    args = parser.parse_args()
    configured()
    if args.configured_only:
        return
    identifiers = capture(["docker", "ps", "-aq"]).split()
    for identifier in identifiers:
        item = json.loads(capture(["docker", "inspect", identifier]))[0]
        print(json.dumps({"container": item["Name"], "image": item["Config"]["Image"], "image_id": item["Image"], "status": item["State"]["Status"], "mounts": [{key: mount.get(key) for key in ["Type", "Name", "Source", "Destination"]} for mount in item.get("Mounts", [])]}))
        if item["State"]["Running"] and any(family in item["Config"]["Image"] for family in ["postgres", "postgis", "timescale"]):
            database_inventory(identifier)
    print(capture(["docker", "volume", "ls", "--format", "{{.Name}}"]), end="")


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as error:
        raise SystemExit(str(error)) from None
