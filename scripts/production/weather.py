#!/usr/bin/env python3
"""Serialized weather delivery. Config is operator-owned; never execute dotenv as shell."""
import argparse
import copy
import fcntl
import json
import os
from pathlib import Path
from collector import command as collector_command
import re
import subprocess
import sys
from uuid import uuid4
import urllib.request

ROOT = Path(__file__).resolve().parents[2]


def run(args, **kwargs):
    return subprocess.run(args, check=True, **kwargs)


def compose(project, files, env_file):
    args = ["docker", "compose", "--env-file", str(env_file), "-p", project]
    for file in files:
        args += ["-f", str(file)]
    return args


def validate_model(model):
    for service in model["services"].values():
        if not re.fullmatch(r"[^\s]+@sha256:[0-9a-f]{64}", service.get("image", "")):
            raise ValueError("Every weather image must have an immutable digest")
        for mount in service.get("volumes", []):
            if mount["type"] == "bind" and not Path(mount["source"]).exists():
                raise ValueError("Missing required weather bind mount; refusing automatic creation")
    for volume in model.get("volumes", {}).values():
        if not volume.get("external"):
            raise ValueError("Weather data volumes must be explicitly provisioned external volumes")
        run(["docker", "volume", "inspect", volume["name"]], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for network in model.get("networks", {}).values():
        if network.get("external"):
            run(["docker", "network", "inspect", network["name"]], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def smoke(config):
    for key, path in [("surface_url", "/health/ready/"), ("wis2box_url", "/oapi/collections")]:
        url = config[key]
        if not url.startswith("https://"):
            raise ValueError("Weather smoke tests require HTTPS")
        with urllib.request.urlopen(url.rstrip("/") + path, timeout=30) as response:
            if response.status != 200:
                raise ValueError("Weather readiness failed")
            body = json.load(response)
            if key == "wis2box_url" and not isinstance(body.get("collections"), list):
                raise ValueError("wis2box returned no valid collection listing")
            if key == "surface_url" and body.get("status") != "ready":
                raise ValueError("SURFACE schema readiness failed")


def deploy(config):
    environment = config["environment"]
    if environment not in {"staging", "production"} or environment != os.environ.get("DEPLOY_ENV"):
        raise ValueError("Weather environment mismatch")
    env_file = Path(config["env_file"])
    if not env_file.is_absolute() or env_file.name != ".env.local" or env_file.stat().st_mode & 0o077:
        raise ValueError("Weather requires a private operator-provisioned .env.local")
    owner = os.environ["GITHUB_REPOSITORY_OWNER"].lower()
    revision = os.environ["GITHUB_SHA"]
    if not re.fullmatch(r"[0-9a-f]{40}", revision):
        raise ValueError("Expected full workflow commit SHA")
    reference = f"ghcr.io/{owner}/barrelsgd-surface:sha-{revision}"
    run(["docker", "pull", reference])
    artifact = json.loads(run(["docker", "image", "inspect", reference], capture_output=True, text=True).stdout)[0]
    if artifact["Config"]["Labels"].get("org.opencontainers.image.revision") != revision:
        raise ValueError("SURFACE artifact revision mismatch")
    digest = next(value for value in artifact["RepoDigests"] if value.startswith(f"ghcr.io/{owner}/barrelsgd-surface@"))
    os.environ["SURFACE_IMAGE"] = digest
    print(f"SURFACE artifact: {digest}")
    commands = {
        "surface": compose(config["surface_project"], [ROOT / "infra/weather/docker-compose.surface.yml"], env_file),
        "wis2box": compose(config["wis2box_project"], [ROOT / "wis2box/docker-compose.yml", ROOT / "wis2box/docker-compose.monitoring.yml", ROOT / "infra/weather/docker-compose.wis2box.yml", ROOT / "infra/weather/docker-compose.wis2box-images.yml"], env_file),
        "proxy": compose(config["proxy_project"], [ROOT / "infra/weather/docker-compose.proxy.yml"], env_file),
    }
    if len({config[key] for key in ["surface_project", "wis2box_project", "proxy_project"]}) != 3:
        raise ValueError("Weather Compose projects must be distinct")
    with open("/var/lock/grenmet/weather.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for args in commands.values():
            model = json.loads(run(args + ["config", "--format", "json"], capture_output=True, text=True).stdout)
            validate_model(model)
        release = None
        collector_path = Path(config.get("collectors_config", "/etc/grenmet/collectors.json"))
        if collector_path.is_file():
            definitions = json.loads(collector_path.read_text())
            release = copy.deepcopy(definitions)
            for name, spec in release.items():
                if spec.get("enabled") is not True:
                    print(f"{name}: integration UNCONFIGURED or disabled")
                    continue
                kind = spec["kind"]
                if kind not in {"wxwatch", "gms-ingest"}:
                    raise ValueError("Unsupported collector kind")
                reference = f"ghcr.io/{owner}/barrelsgd-{kind}:sha-{os.environ['GITHUB_SHA']}"
                run(["docker", "pull", reference])
                artifact = json.loads(run(["docker", "image", "inspect", reference], capture_output=True, text=True).stdout)[0]
                if artifact["Config"]["Labels"].get("org.opencontainers.image.revision") != os.environ["GITHUB_SHA"]:
                    raise ValueError("Collector artifact revision mismatch")
                spec["image"] = next(value for value in artifact["RepoDigests"] if value.startswith(f"ghcr.io/{owner}/barrelsgd-{kind}@"))
                collector_command(name, spec)
                print(f"{name} artifact: {spec['image']}")
        else:
            print("Collectors UNCONFIGURED: operator source configuration is absent")
        # Backup gate is mandatory, including any first application rollout.
        # New hosts must complete operator provisioning and their first backup first.
        backup_config = json.loads(Path(config["backup_config"]).read_text())
        if any(backup_config[key] != config[key] for key in ["environment", "surface_project", "wis2box_project"]):
            raise ValueError("Backup inventory does not match the deployment target")
        run([sys.executable, str(ROOT / "scripts/production/weather-backup.py"), config["backup_config"], "--lock-held"])
        for args in commands.values():
            run(args + ["pull"])
        surface_model = json.loads(run(commands["surface"] + ["config", "--format", "json"], capture_output=True, text=True).stdout)
        image = surface_model["services"]["api"]["image"]
        revision = run(["docker", "image", "inspect", "--format", '{{index .Config.Labels "org.opencontainers.image.revision"}}', image], capture_output=True, text=True).stdout.strip()
        if revision != os.environ["GITHUB_SHA"]:
            raise ValueError("SURFACE artifact does not match workflow commit")
        run(commands["surface"] + ["up", "-d", "--wait", "postgres", "redis", "cache"])
        run(commands["surface"] + ["run", "--rm", "--no-deps", "migrate"])
        services = [name for name in surface_model["services"] if name not in {"postgres", "redis", "cache", "migrate"}]
        run(commands["surface"] + ["up", "-d", "--no-deps", "--wait", "--wait-timeout", "300"] + services)
        run(commands["wis2box"] + ["up", "-d", "--wait", "--wait-timeout", "300"])
        run(commands["proxy"] + ["up", "-d", "--wait"])
        smoke(config)
        if release is not None:
            destination = collector_path.with_name("collectors.release.json")
            temporary = destination.with_name(destination.name + "." + uuid4().hex + ".tmp")
            with open(temporary, "x") as output:
                os.chmod(temporary, 0o600)
                json.dump(release, output)
            temporary.replace(destination)
        print("Weather deployment passed schema readiness and public API smoke checks")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("config", help="Operator-reviewed JSON descriptor; secrets remain in .env.local")
    args = parser.parse_args()
    try:
        deploy(json.loads(Path(args.config).read_text()))
    except (KeyError, ValueError, OSError, subprocess.SubprocessError):
        print("Weather deployment failed; review configuration, backups, migrations and readiness", file=sys.stderr)
        sys.exit(1)
