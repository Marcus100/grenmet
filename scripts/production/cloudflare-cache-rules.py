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
  2. public hosts: /_next/static/ and static asset extensions may be cached, but
     only when the origin's Cache-Control says so (no header: not cached, not
     even with Cloudflare's default TTLs), with Cache Deception Armor;
  3. bypass again for the API and staff hosts, any /api/ path, and any request
     carrying a session cookie (every app's cookie ends in `_session`, plus the
     CMS's `payload-token`).
Runbook: docs/operations/cloudflare-proxy.md.
"""

import argparse
import json
import sys
from pathlib import Path

# Also loadable as a module from elsewhere (cloudflare-proxy.test.mjs).
sys.path.insert(0, str(Path(__file__).resolve().parent))
from cloudflare_rulesets import PRIVATE_HOSTS, PUBLIC_HOSTS, base_domain, host_set, sync  # noqa: E402

PHASE = "http_request_cache_settings"
# Every app's session cookie is `<app>_session` (also `_session_sso` and
# `_session_notice`, packages/auth); Payload's own admin cookie is payload-token.
SESSION_COOKIE_MARKERS = ("_session", "payload-token")
STATIC_EXTENSIONS = (
    "css", "js", "mjs", "woff", "woff2", "ttf", "otf", "ico",
    "png", "jpg", "jpeg", "gif", "webp", "avif", "svg",
)


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
            "description": f"GrenMet {environment}: static assets on public hosts, only when the origin marks them cacheable",
            "expression": (
                f"(http.host in {public}) and (starts_with(http.request.uri.path, \"/_next/static/\") "
                f"or http.request.uri.path.extension in {extensions})"
            ),
            "action": "set_cache_settings",
            "action_parameters": {
                "cache": True,
                # Use Cache-Control when present, never cache when absent.
                "edge_ttl": {"mode": "bypass_by_default"},
                "browser_ttl": {"mode": "bypass_by_default"},
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
    return sync(PHASE, args.environment, managed, args.apply, "cache rules", 10)


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (ValueError, OSError, RuntimeError, KeyError) as error:
        print(f"Cache rules refused: {error}", file=sys.stderr)
        sys.exit(1)
