#!/usr/bin/env python3
"""Cloudflare Transform Rule that adds the origin secret to every request.

Owner-run only; nothing calls this automatically. Idempotent: it owns the rule
with ref `grenmet-<environment>-origin-secret` in the zone's
http_request_late_transform phase and keeps every other rule as it is.

Traefik's origin gate (CLOUDFLARE_PROXY_ENABLED, render-env.py) refuses with 403
any connection from a Cloudflare address that lacks this header, so another
Cloudflare customer's Worker cannot reach the droplet directly and choose its own
X-Forwarded-For. Install the rule BEFORE turning the switch on, or every proxied
request is refused. Traefik removes the header before any app sees it.

    export CLOUDFLARE_API_TOKEN=...      # Zone > Transform Rules > Edit, barrels.gd only; never commit it
    export CLOUDFLARE_ZONE_ID=...
    export CLOUDFLARE_ORIGIN_SECRET=...  # the same value as the GitHub environment secret
    python3 scripts/production/cloudflare-origin-header.py --environment staging            # plan
    python3 scripts/production/cloudflare-origin-header.py --environment staging --apply
    python3 scripts/production/cloudflare-origin-header.py --environment staging --remove --apply

Runbook: docs/operations/cloudflare-proxy.md.
"""

import argparse
import importlib.util
import json
import os
import re
import sys
from pathlib import Path


def _sibling(name):
    """Load scripts/production/<name>.py, wherever this script is run or loaded from."""
    spec = importlib.util.spec_from_file_location(name, Path(__file__).resolve().with_name(f"{name}.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


_rules = _sibling("cloudflare_rulesets")
PRIVATE_HOSTS, PUBLIC_HOSTS, ROOT = _rules.PRIVATE_HOSTS, _rules.PUBLIC_HOSTS, _rules.ROOT
base_domain, host_set, sync = _rules.base_domain, _rules.host_set, _rules.sync

PHASE = "http_request_late_transform"
# Must match ORIGIN_HEADER and ORIGIN_SECRET in render-env.py.
ORIGIN_HEADER = "X-Barrels-Origin"
ORIGIN_SECRET = re.compile(r"[A-Za-z0-9_-]{32,128}")
MASK = "<CLOUDFLARE_ORIGIN_SECRET>"
EXTRA_HOST = re.compile(r"Host\(`([a-z0-9.-]+)`\)")
HOSTNAME = re.compile(r"(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}")


def extra_hosts(environment, environ=os.environ):
    """Router aliases outside BASE_DOMAIN that also reach the droplet.

    Read from the env file's *_EXTRA_HOSTS_RULE values (for example
    API_EXTRA_HOSTS_RULE=" || Host(`api.weather.gd`)" at the weather.gd cutover)
    plus CLOUDFLARE_EXTRA_HOSTS (comma-separated), so a new alias gets the
    header as soon as it is configured. A host in another Cloudflare zone needs
    this script run again with that zone's CLOUDFLARE_ZONE_ID."""
    hosts = []
    for line in (ROOT / f"infra/docker/{environment}.env").read_text().splitlines():
        key, _, value = line.partition("=")
        if key.endswith("_EXTRA_HOSTS_RULE"):
            hosts += EXTRA_HOST.findall(value)
    hosts += [h.strip().lower() for h in environ.get("CLOUDFLARE_EXTRA_HOSTS", "").split(",") if h.strip()]
    for host in hosts:
        if not HOSTNAME.fullmatch(host):
            raise ValueError(f"extra host {host!r} is not a hostname")
    return list(dict.fromkeys(hosts))


def rules(environment, secret, environ=os.environ):
    domain = base_domain(environment)
    hosts = host_set(PUBLIC_HOSTS + PRIVATE_HOSTS, domain)
    extras = extra_hosts(environment, environ)
    if extras:
        hosts = hosts[:-1] + " " + " ".join(f'"{host}"' for host in extras) + "}"
    return [
        {
            "ref": f"grenmet-{environment}-origin-secret",
            "description": f"GrenMet {environment}: origin secret Traefik requires from Cloudflare",
            "expression": f"(http.host in {hosts})",
            "action": "rewrite",
            # `set` overwrites any value a visitor sends.
            "action_parameters": {"headers": {ORIGIN_HEADER: {"operation": "set", "value": secret}}},
            "enabled": True,
        }
    ]


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--environment", required=True, choices=["staging", "production"])
    parser.add_argument("--apply", action="store_true", help="write the rule (default: print the plan)")
    parser.add_argument("--remove", action="store_true", help="delete this environment's rule (gate test or rollback)")
    parser.add_argument("--print", action="store_true", help="print the rule as JSON, secret masked, and exit")
    args = parser.parse_args(argv)

    if args.remove:
        managed = []
    elif args.print:
        managed = rules(args.environment, MASK)
    else:
        secret = os.environ.get("CLOUDFLARE_ORIGIN_SECRET", "")
        if not ORIGIN_SECRET.fullmatch(secret):
            raise ValueError(
                "set CLOUDFLARE_ORIGIN_SECRET to the GitHub environment secret "
                "(32 to 128 letters, digits, '-' or '_'; openssl rand -hex 32)"
            )
        managed = rules(args.environment, secret)
    if args.print:
        print(json.dumps(managed, indent=2))
        return 0
    return sync(PHASE, args.environment, managed, args.apply, "request header transform rules", 10)


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (ValueError, OSError, RuntimeError, KeyError) as error:
        print(f"Origin header rule refused: {error}", file=sys.stderr)
        sys.exit(1)
