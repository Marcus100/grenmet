#!/usr/bin/env python3
"""Cloudflare's published edge address ranges, vendored for the origin.

The list lives in infra/cloudflare/ip-ranges.txt. Traefik trusts forwarded
headers only from these ranges (render-env.py) and the origin firewall lets only
these ranges reach 80/443 (cloudflare-origin-firewall.py), so a corrupted list
must fail loudly instead of trusting the whole internet.

    python3 scripts/production/cloudflare_ranges.py --check    # vendored vs live (exit 1 on drift)
    python3 scripts/production/cloudflare_ranges.py --update   # rewrite the vendored file from live
    python3 scripts/production/cloudflare_ranges.py --print    # comma-separated, for scripts

Nothing here runs automatically; the owner reviews --check output and commits
an --update through a normal PR.
"""

import argparse
import datetime
import ipaddress
import sys
import urllib.request
from pathlib import Path

SOURCES = ("https://www.cloudflare.com/ips-v4", "https://www.cloudflare.com/ips-v6")
RANGES_FILE = Path(__file__).resolve().parents[2] / "infra/cloudflare/ip-ranges.txt"
# Cloudflare publishes /13 or longer (IPv4) and /29 or longer (IPv6). A much
# broader prefix means a corrupted or hostile list, so it is refused.
BROADEST_PREFIX = {4: 10, 6: 24}
MAX_RANGES = 100


def parse(text):
    """Validated networks from a range list: one CIDR per line, '#' comments.

    Raises ValueError for a bad entry, a non-public or over-broad range, a
    missing address family or an implausibly long list."""
    networks = []
    for number, raw in enumerate(text.splitlines(), start=1):
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        try:
            network = ipaddress.ip_network(line, strict=True)
        except ValueError:
            raise ValueError(f"line {number}: not a CIDR range") from None
        if network.prefixlen < BROADEST_PREFIX[network.version]:
            raise ValueError(f"line {number}: range broader than /{BROADEST_PREFIX[network.version]}")
        if not network.is_global:
            raise ValueError(f"line {number}: not a public range")
        if network not in networks:
            networks.append(network)
    if len(networks) > MAX_RANGES:
        raise ValueError(f"more than {MAX_RANGES} ranges")
    for version in (4, 6):
        if not any(network.version == version for network in networks):
            raise ValueError(f"no IPv{version} ranges")
    return sorted(networks, key=lambda network: (network.version, network))


def load(path=RANGES_FILE):
    """The vendored ranges as strings, IPv4 first."""
    return [str(network) for network in parse(Path(path).read_text())]


def render(networks, fetched):
    header = [
        "# Cloudflare's published edge (proxy) address ranges. Vendored: do not hand-edit.",
        f"# Sources: {SOURCES[0]} and {SOURCES[1]}",
        "# Refresh: python3 scripts/production/cloudflare_ranges.py --update (drift: --check)",
        f"# Fetched: {fetched}",
    ]
    return "\n".join(header + [str(network) for network in networks]) + "\n"


def fetch(opener=urllib.request.urlopen):
    parts = []
    for url in SOURCES:
        # Cloudflare answers 403 to urllib's default User-Agent.
        request = urllib.request.Request(url, headers={"User-Agent": "grenmet-ranges/1 (+curl-compatible)"})
        with opener(request, timeout=20) as response:
            parts.append(response.read().decode("ascii"))
    return parse("\n".join(parts))


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true", help="compare the vendored list with Cloudflare's")
    mode.add_argument("--update", action="store_true", help="rewrite the vendored list from Cloudflare's")
    mode.add_argument("--print", action="store_true", help="print the vendored list comma-separated")
    parser.add_argument("--file", default=str(RANGES_FILE))
    args = parser.parse_args(argv)
    if args.print:
        print(",".join(load(args.file)))
        return 0
    live = fetch()
    if args.update:
        Path(args.file).write_text(render(live, datetime.date.today().isoformat()))
        print(f"Wrote {len(live)} ranges to {args.file}; review the diff and commit it.")
        return 0
    vendored = parse(Path(args.file).read_text())
    added = [str(n) for n in live if n not in vendored]
    removed = [str(n) for n in vendored if n not in live]
    if not (added or removed):
        print(f"Vendored list matches Cloudflare ({len(live)} ranges).")
        return 0
    for network in added:
        print(f"+ {network} (published by Cloudflare, missing here)")
    for network in removed:
        print(f"- {network} (vendored, no longer published)")
    print("Run --update, commit, redeploy, then re-run the firewall script.")
    return 1


if __name__ == "__main__":
    try:
        sys.exit(main(sys.argv[1:]))
    except (ValueError, OSError) as error:
        print(f"Cloudflare ranges rejected: {error}", file=sys.stderr)
        sys.exit(1)
