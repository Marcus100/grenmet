#!/usr/bin/env python3
"""Read-only configured and actual storage inventory. Output is an allowlist."""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COMPOSE = ["infra/docker/docker-compose.yml", "infra/docker/docker-compose.deploy.yml", "apps/api/fastapi/docker-compose.yml", "surface/docker-compose.yml", "wis2box/docker-compose.yml", "wis2box/docker-compose.monitoring.yml", "infra/weather/docker-compose.surface.yml", "infra/weather/docker-compose.wis2box.yml", "infra/weather/docker-compose.proxy.yml"]


def capture(args):
    result = subprocess.run(args, capture_output=True, text=True, timeout=60)
    if result.returncode:
        raise RuntimeError("Inventory command unavailable; run on the configured Docker host")
    return result.stdout


def service_inventory(project):
    """Compare one core project to current configuration; never mutate Docker."""
    model = json.loads(capture([
        "docker", "compose", "-f", str(ROOT / "infra/docker/docker-compose.deploy.yml"),
        "config", "--no-interpolate", "--no-env-resolution", "--no-consistency", "--format", "json",
    ]))
    expected = sorted(model["services"])
    if not expected:
        raise RuntimeError("Current service configuration is empty")
    identifiers = capture(["docker", "ps", "-aq", "--filter", f"label=com.docker.compose.project={project}"]).split()
    containers = []
    images = {}
    for identifier in identifiers:
        item = json.loads(capture(["docker", "container", "inspect", identifier]))[0]
        labels = item["Config"].get("Labels") or {}
        if labels.get("com.docker.compose.project") != project:
            raise RuntimeError("Container ownership changed during inventory; retry")
        service = labels.get("com.docker.compose.service")
        if item["Image"] not in images:
            image = json.loads(capture(["docker", "image", "inspect", item["Image"]]))[0]
            images[item["Image"]] = image.get("RepoDigests") or []
        containers.append({
            "id": item["Id"], "container": item["Name"], "project": project,
            "service": service, "status": item["State"]["Status"],
            "restart_policy": item.get("HostConfig", {}).get("RestartPolicy", {}).get("Name"),
            "classification": "current" if service in expected else "unexpected-review-required",
            "legacy_service": service in {"web-hurricaneplan", "web-spicewx"},
            "oneoff": labels.get("com.docker.compose.oneoff"),
            "image": item["Config"]["Image"], "image_id": item["Image"],
            "image_digests": images[item["Image"]],
            "mounts": [{key: mount.get(key) for key in ["Type", "Name", "Source", "Destination", "RW"]} for mount in item.get("Mounts", [])],
            "networks": sorted(item.get("NetworkSettings", {}).get("Networks", {})),
            "routing": {key: value for key, value in labels.items() if key == "traefik.enable" or re.fullmatch(r"traefik\.http\.routers\.[^.]+\.(rule|entrypoints|service|tls\.certresolver)", key) or re.fullmatch(r"traefik\.http\.services\.[^.]+\.loadbalancer\.server\.port", key)},
        })
    return {"schema_version": 1, "project": project, "expected_services": expected,
            "containers": sorted(containers, key=lambda item: item["container"]),
            "unexpected_services": sorted({item["service"] or "<missing-service-label>" for item in containers if item["classification"] != "current"}),
            "note": "Read-only snapshot, not retirement approval. Review traffic, writable data and recovery before stopping any container."}


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
    parser.add_argument("--services-only", action="store_true", help="Read-only core service/router inventory; no database queries")
    parser.add_argument("--project", choices=["grenmet", "grenmet-staging"])
    args = parser.parse_args()
    if args.services_only:
        if not args.project or args.configured_only:
            parser.error("--services-only requires --project and cannot be combined with --configured-only")
        print(json.dumps(service_inventory(args.project)))
        return
    if args.project:
        parser.error("--project requires --services-only")
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
    except (RuntimeError, OSError, ValueError, KeyError, IndexError, TypeError, subprocess.TimeoutExpired):
        raise SystemExit("Inventory failed; run on the configured Docker host and retry. No retirement decision was produced.") from None
