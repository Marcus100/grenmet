#!/usr/bin/env python3
"""Ping only after successful work; never print the credential-bearing URL."""

import os
import sys
import urllib.request
from urllib.parse import urlsplit


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def notify(variable):
    url = os.environ.get(variable)
    if not url:
        return True
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname
        not in {"uptime.betterstack.com", "incidents.betterstack.com"}
        or not parsed.path.startswith("/api/v1/heartbeat/")
        or parsed.username
        or parsed.query
    ):
        return False
    try:
        with urllib.request.build_opener(NoRedirect()).open(
            url, timeout=10
        ) as response:
            return response.status == 200
    except OSError:
        return False


if __name__ == "__main__":
    if not notify(sys.argv[1]):
        print("Backup succeeded, but monitoring delivery failed", file=sys.stderr)
        raise SystemExit(1)
