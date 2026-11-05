#!/usr/bin/env python3
"""Limit a droplet's DigitalOcean Cloud Firewall so only Cloudflare reaches 80/443.

Owner-run only; nothing calls this automatically. It changes the inbound TCP 80
and 443 rules and nothing else: SSH (22), the private 5432 rule, ICMP and every
outbound rule stay exactly as they are. Dry run is the default.

    # needs an authenticated doctl (doctl auth init) with write access to firewalls
    python3 scripts/production/cloudflare-origin-firewall.py --firewall core-staging            # plan
    python3 scripts/production/cloudflare-origin-firewall.py --firewall core-staging --apply    # change
    python3 scripts/production/cloudflare-origin-firewall.py --firewall core-staging --restore-open --apply

Why the Cloud Firewall and not ufw: Docker's own iptables rules for published
ports run before ufw's, so ufw cannot close 80/443 on the droplet
(docs/operations/host-hardening.md, Step 4). Only after every hostname that
points at the droplet is proxied (orange cloud); a DNS-only hostname stops
working the moment this is applied. Runbook: docs/operations/cloudflare-proxy.md.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

from cloudflare_ranges import load as load_cloudflare_ranges

WEB_PORTS = ("80", "443")
EVERYONE = ["0.0.0.0/0", "::/0"]
SOURCE_KEYS = (
    ("addresses", "address"),
    ("droplet_ids", "droplet_id"),
    ("tags", "tag"),
    ("load_balancer_uids", "load_balancer_uid"),
    ("kubernetes_ids", "kubernetes_id"),
)


def covers_web_port(ports):
    """True when a TCP port spec includes 80 or 443 ("0"/"all" means every port)."""
    text = str(ports or "").strip().lower()
    if text in {"", "0", "all"}:
        return True
    low, _, high = text.partition("-")
    low_n, high_n = int(low), int(high or low)
    return any(low_n <= int(port) <= high_n for port in WEB_PORTS)


def rule_spec(rule):
    """The doctl --inbound-rules text for one rule (fields comma-separated)."""
    parts = [f"protocol:{rule['protocol']}"]
    if rule.get("ports") not in (None, ""):
        parts.append(f"ports:{rule['ports']}")
    sources = rule.get("sources") or {}
    for key, name in SOURCE_KEYS:
        parts.extend(f"{name}:{value}" for value in sources.get(key) or [])
    return ",".join(parts)


def web_rule(port, addresses):
    return {"protocol": "tcp", "ports": port, "sources": {"addresses": list(addresses)}}


def plan(firewall, addresses):
    """(add, remove) inbound rules so 80 and 443 accept exactly `addresses`.

    Refuses a TCP rule that covers 80/443 inside a wider range: splitting it
    automatically could silently close or open other ports."""
    current_web = []
    for rule in firewall.get("inbound_rules") or []:
        if rule.get("protocol") != "tcp" or not covers_web_port(rule.get("ports")):
            continue
        if str(rule.get("ports")) not in WEB_PORTS:
            raise ValueError(
                f"inbound tcp rule for ports {rule.get('ports')!r} covers 80/443; "
                "split it into explicit rules in the DigitalOcean dashboard first"
            )
        current_web.append(rule)
    desired = [web_rule(port, addresses) for port in WEB_PORTS]
    remove = [rule for rule in current_web if not any(same(rule, want) for want in desired)]
    add = [want for want in desired if not any(same(rule, want) for rule in current_web)]
    return add, remove


def same(rule, other):
    def key(item):
        sources = item.get("sources") or {}
        return (
            item.get("protocol"),
            str(item.get("ports")),
            tuple(sorted((name, str(value)) for name, _ in SOURCE_KEYS for value in sources.get(name) or [])),
        )

    return key(rule) == key(other)


def doctl(*args):
    result = subprocess.run(["doctl", *args, "--output", "json"], capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"doctl {args[0]} {args[1]} {args[2]} failed: {result.stderr.strip()}")
    return json.loads(result.stdout or "null")


def find_firewall(name_or_id, listing):
    matches = [item for item in listing if name_or_id in (item.get("id"), item.get("name"))]
    if len(matches) != 1:
        raise ValueError(f"expected one firewall named or with id {name_or_id!r}, found {len(matches)}")
    return matches[0]


def describe(firewall):
    print(f"Firewall {firewall.get('name')} ({firewall.get('id')})")
    print(f"  droplets: {firewall.get('droplet_ids') or []}  tags: {firewall.get('tags') or []}")
    others = [r for r in firewall.get("inbound_rules") or [] if r.get("protocol") != "tcp" or not covers_web_port(r.get("ports"))]
    for rule in others:
        print(f"  kept as is: {rule_spec(rule)}")
    if not any(str(rule.get("ports")) == "22" for rule in others):
        print("  WARNING: no inbound SSH (22) rule; SSH access is not this script's job, check it.")


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--firewall", required=True, help="DigitalOcean firewall name or id")
    parser.add_argument("--apply", action="store_true", help="make the change (default: print the plan)")
    parser.add_argument("--restore-open", action="store_true", help="rollback: allow 80/443 from everyone again")
    parser.add_argument("--current-json", help="read the firewall listing from this file instead of doctl (offline plan)")
    args = parser.parse_args(argv)
    if args.apply and args.current_json:
        raise ValueError("--apply needs the live firewall; drop --current-json")

    listing = json.loads(Path(args.current_json).read_text()) if args.current_json else doctl("compute", "firewall", "list")
    firewall = find_firewall(args.firewall, listing)
    addresses = EVERYONE if args.restore_open else load_cloudflare_ranges()
    add, remove = plan(firewall, addresses)

    describe(firewall)
    target = "everyone (rollback)" if args.restore_open else f"{len(addresses)} Cloudflare ranges"
    if not (add or remove):
        print(f"No change: 80 and 443 already accept exactly {target}.")
        return 0
    print(f"Plan: 80 and 443 accept {target}. Added first, then removed, so the ports never close.")
    for rule in add:
        print(f"  add    {rule_spec(rule)}")
    for rule in remove:
        print(f"  remove {rule_spec(rule)}")
    if not args.apply:
        print("Dry run: nothing changed. Re-run with --apply to make this change.")
        return 0

    firewall_id = firewall["id"]
    for rule in add:
        doctl("compute", "firewall", "add-rules", firewall_id, "--inbound-rules", rule_spec(rule))
    for rule in remove:
        doctl("compute", "firewall", "remove-rules", firewall_id, "--inbound-rules", rule_spec(rule))
    after = find_firewall(firewall_id, doctl("compute", "firewall", "list"))
    left_add, left_remove = plan(after, addresses)
    if left_add or left_remove:
        print("Applied, but the firewall does not match the plan; check it in the dashboard:", file=sys.stderr)
        for rule in after.get("inbound_rules") or []:
            print(f"  now    {rule_spec(rule)}", file=sys.stderr)
        return 1
    print(f"Applied: 80 and 443 now accept {target} only. Verify with the runbook's direct-origin test.")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (ValueError, OSError, RuntimeError, KeyError, json.JSONDecodeError) as error:
        print(f"Firewall change refused: {error}", file=sys.stderr)
        sys.exit(1)
