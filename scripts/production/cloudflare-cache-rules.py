#!/usr/bin/env python3
"""Cloudflare cache rules for one environment: cache static assets only.

Owner-run only; nothing calls this automatically. Idempotent: it rewrites only
the rules it owns (ref `grenmet-<environment>-*`) in the zone's
http_request_cache_settings phase and keeps every other rule as it is.

    export CLOUDFLARE_API_TOKEN=...   # Zone > Cache Rules > Edit, for barrels.gd only; never commit it
    export CLOUDFLARE_ZONE_ID=...     # Cloudflare dashboard > barrels.gd > Overview (right column)
    python3 scripts/production/cloudflare-cache-rules.py --environment staging            # plan
    python3 scripts/production/cloudflare-cache-rules.py --environment staging --apply    # change
    python3 scripts/production/cloudflare-cache-rules.py --environment staging --remove --apply

Rules run in order and a later match wins, so the three rules are:
  1. every host of the environment: do not cache (Cloudflare would otherwise cache
     some file extensions, PDFs and spreadsheets included, on any host);
  2. public hosts: cache /_next/static/ and static asset extensions, honouring
     the origin's Cache-Control, with Cache Deception Armor;
  3. bypass again for the API and staff hosts, any /api/ path, and any request
     carrying a session cookie (every app's cookie ends in `_session`, plus the
     CMS's `payload-token`).
Runbook: docs/operations/cloudflare-proxy.md.
"""

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
API = "https://api.cloudflare.com/client/v4"
PHASE = "http_request_cache_settings"
# Hostname prefixes (before BASE_DOMAIN) of the routers in docker-compose.deploy.yml.
# cloudflare-proxy.test.mjs fails when a router's host is in neither list.
PUBLIC_HOSTS = ("weather", "events", "bookings", "cap", "gmsdash", "signal", "mbia", "docs")
PRIVATE_HOSTS = ("api", "auth", "admin", "gms", "cms", "adminer")
# Every app's session cookie is `<app>_session` (also `_session_sso` and
# `_session_notice`, packages/auth); Payload's own admin cookie is payload-token.
SESSION_COOKIE_MARKERS = ("_session", "payload-token")
STATIC_EXTENSIONS = (
    "css", "js", "mjs", "woff", "woff2", "ttf", "otf", "ico",
    "png", "jpg", "jpeg", "gif", "webp", "avif", "svg",
)
KEPT_FIELDS = ("id", "ref", "expression", "action", "action_parameters", "description", "enabled", "logging")


def base_domain(environment):
    for line in (ROOT / f"infra/docker/{environment}.env").read_text().splitlines():
        if line.startswith("BASE_DOMAIN="):
            return line.split("=", 1)[1].strip()
    raise ValueError(f"BASE_DOMAIN missing from infra/docker/{environment}.env")


def host_set(prefixes, domain):
    return "{" + " ".join(f'"{prefix}.{domain}"' for prefix in prefixes) + "}"


def rules(environment):
    domain = base_domain(environment)
    every = host_set(PUBLIC_HOSTS + PRIVATE_HOSTS, domain)
    public = host_set(PUBLIC_HOSTS, domain)
    private = host_set(PRIVATE_HOSTS, domain)
    extensions = "{" + " ".join(f'"{ext}"' for ext in STATIC_EXTENSIONS) + "}"
    cookies = " or ".join(f'http.cookie contains "{marker}"' for marker in SESSION_COOKIE_MARKERS)
    ref = f"grenmet-{environment}"
    return [
        {
            "ref": f"{ref}-default-no-cache",
            "description": f"GrenMet {environment}: nothing is cached unless a later rule allows it",
            "expression": f"(http.host in {every})",
            "action": "set_cache_settings",
            "action_parameters": {"cache": False},
            "enabled": True,
        },
        {
            "ref": f"{ref}-static-assets",
            "description": f"GrenMet {environment}: cache static assets on public hosts (origin Cache-Control)",
            "expression": (
                f"(http.host in {public}) and (starts_with(http.request.uri.path, \"/_next/static/\") "
                f"or http.request.uri.path.extension in {extensions})"
            ),
            "action": "set_cache_settings",
            "action_parameters": {
                "cache": True,
                "edge_ttl": {"mode": "respect_origin"},
                "browser_ttl": {"mode": "respect_origin"},
                "cache_key": {"cache_deception_armor": True},
            },
            "enabled": True,
        },
        {
            "ref": f"{ref}-never-cache-private",
            "description": f"GrenMet {environment}: never cache the API, staff hosts, /api/ paths or signed-in requests",
            "expression": (
                f"(http.host in {private}) or (http.host in {every} and "
                f"(starts_with(http.request.uri.path, \"/api/\") or {cookies}))"
            ),
            "action": "set_cache_settings",
            "action_parameters": {"cache": False},
            "enabled": True,
        },
    ]


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
    return [{key: rule.get(key) for key in KEPT_FIELDS if key not in {"id"}} for rule in rule_list]


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
        messages = "; ".join(item.get("message", "") for item in json.loads(detail or "{}").get("errors", [])) if detail.startswith("{") else detail[:300]
        raise RuntimeError(f"Cloudflare API {method} answered {error.code}: {messages}") from None


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--environment", required=True, choices=["staging", "production"])
    parser.add_argument("--apply", action="store_true", help="write the rules (default: print the plan)")
    parser.add_argument("--remove", action="store_true", help="rollback: delete this environment's rules")
    parser.add_argument("--print", action="store_true", help="print this environment's rules as JSON and exit")
    args = parser.parse_args(argv)

    managed = [] if args.remove else rules(args.environment)
    if args.print:
        print(json.dumps(managed, indent=2))
        return 0
    token = os.environ.get("CLOUDFLARE_API_TOKEN", "")
    zone = os.environ.get("CLOUDFLARE_ZONE_ID", "")
    if not token or not re.fullmatch(r"[0-9a-f]{32}", zone):
        raise ValueError("set CLOUDFLARE_API_TOKEN and CLOUDFLARE_ZONE_ID (32 hex characters) first")

    path = f"/zones/{zone}/rulesets/phases/{PHASE}/entrypoint"
    current = call("GET", path, token)["result"].get("rules") or []
    desired = merge(current, args.environment, managed)
    if comparable(desired) == comparable([{k: r.get(k) for k in KEPT_FIELDS if k in r} for r in current]):
        print(f"No change: {args.environment} cache rules are already in place ({len(current)} rules in the zone).")
        return 0
    prefix = f"grenmet-{args.environment}-"
    before = {r.get("ref") for r in current if str(r.get("ref", "")).startswith(prefix)}
    after = {r["ref"] for r in managed}
    print(f"Zone cache rules: {len(current)} now, {len(desired)} after (the free plan allows 10).")
    for ref in sorted(after - before):
        print(f"  add     {ref}")
    for ref in sorted(after & before):
        print(f"  replace {ref}")
    for ref in sorted(before - after):
        print(f"  remove  {ref}")
    if not args.apply:
        print("Dry run: nothing changed. --print shows the rules; re-run with --apply to write them.")
        return 0
    call("PUT", path, token, {"rules": desired})
    print(f"Applied. Check {args.environment} with the runbook's cf-cache-status commands.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (ValueError, OSError, RuntimeError, KeyError) as error:
        print(f"Cache rules refused: {error}", file=sys.stderr)
        sys.exit(1)
