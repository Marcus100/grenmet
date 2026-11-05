"""Shared helpers for the owner-run Cloudflare rule scripts.

cloudflare-cache-rules.py and cloudflare-origin-header.py each own the rules
whose ref starts with `grenmet-<environment>-` in one phase of the barrels.gd
zone. sync() rewrites only those, keeps every other rule as it is, prints the
plan, and writes only with apply=True. The API token comes from the
environment and is never printed.
"""

import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = "https://api.cloudflare.com/client/v4"
# Hostname prefixes (before BASE_DOMAIN) of the routers in docker-compose.deploy.yml.
# cloudflare-proxy.test.mjs fails when a router's host is in neither list.
PUBLIC_HOSTS = ("weather", "events", "bookings", "cap", "gmsdash", "signal", "mbia", "docs")
PRIVATE_HOSTS = ("api", "auth", "admin", "gms", "cms", "adminer")
KEPT_FIELDS = ("id", "ref", "expression", "action", "action_parameters", "description", "enabled", "logging")


def base_domain(environment):
    for line in (ROOT / f"infra/docker/{environment}.env").read_text().splitlines():
        if line.startswith("BASE_DOMAIN="):
            return line.split("=", 1)[1].strip()
    raise ValueError(f"BASE_DOMAIN missing from infra/docker/{environment}.env")


def host_set(prefixes, domain):
    return "{" + " ".join(f'"{prefix}.{domain}"' for prefix in prefixes) + "}"


def merge(current, environment, managed):
    """Foreign rules first, unchanged and in order; this environment's rules last."""
    prefix = f"grenmet-{environment}-"
    kept = [
        {key: rule[key] for key in KEPT_FIELDS if key in rule}
        for rule in current
        if not str(rule.get("ref", "")).startswith(prefix)
    ]
    return kept + managed


def comparable(rule_list):
    return [{key: rule.get(key) for key in KEPT_FIELDS if key != "id"} for rule in rule_list]


def call(method, path, token, body=None):
    request = urllib.request.Request(
        f"{API}{path}",
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read())
    except urllib.error.HTTPError as error:
        if method == "GET" and error.code == 404:
            return {"result": {"rules": []}}
        detail = error.read().decode(errors="replace")
        messages = (
            "; ".join(item.get("message", "") for item in json.loads(detail or "{}").get("errors", []))
            if detail.startswith("{")
            else detail[:300]
        )
        raise RuntimeError(f"Cloudflare API {method} answered {error.code}: {messages}") from None


def credentials():
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    zone = os.environ.get("CLOUDFLARE_ZONE_ID", "")
    if not token or not re.fullmatch(r"[0-9a-f]{32}", zone):
        raise ValueError("set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID (32 hex characters) first")
    return token, zone


def sync(phase, environment, managed, apply, label, limit):
    """Make this environment's rules in `phase` equal `managed`. Returns 0."""
    token, zone = credentials()
    path = f"/zones/{zone}/rulesets/phases/{phase}/entrypoint"
    current = call("GET", path, token)["result"].get("rules") or []
    desired = merge(current, environment, managed)
    if comparable(desired) == comparable([{k: r.get(k) for k in KEPT_FIELDS if k in r} for r in current]):
        print(f"No change: {environment} {label} are already in place ({len(current)} rules in the zone).")
        return 0
    prefix = f"grenmet-{environment}-"
    before = {r.get("ref") for r in current if str(r.get("ref", "")).startswith(prefix)}
    after = {r["ref"] for r in managed}
    print(f"Zone {label}: {len(current)} now, {len(desired)} after (the free plan allows {limit}).")
    for ref in sorted(after - before):
        print(f"  add     {ref}")
    for ref in sorted(after & before):
        print(f"  replace {ref}")
    for ref in sorted(before - after):
        print(f"  remove  {ref}")
    if not apply:
        print("Dry run: nothing changed. --print shows the rules; re-run with --apply to write them.")
        return 0
    call("PUT", path, token, {"rules": desired})
    print(f"Applied {environment} {label}.")
    return 0
