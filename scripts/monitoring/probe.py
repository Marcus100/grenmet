#!/usr/bin/env python3
"""Bounded, unauthenticated availability checks. No response bodies enter reports."""

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
import os
from uuid import uuid4
from pathlib import Path
import urllib.error
import urllib.request

CATALOGUE = (
    Path(__file__).resolve().parents[2] / "packages/ui/src/lib/service-catalogue.json"
)


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def check(service, environment, opener=None):
    entry = service["environments"][environment]
    result = {
        "app": service["id"],
        "owner": service["owner"],
        "environment": environment,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "scheduled-probe",
        "status": "unknown",
        "httpStatus": None,
    }
    if not entry["origin"] or entry["deployment"] == "pending":
        return dict(result, status="pending")
    if service["id"] == "nisa":
        return dict(result, status="protection-only-unverified")
    opener = opener or urllib.request.build_opener(NoRedirect())
    try:
        with opener.open(
            urllib.request.Request(
                entry["origin"] + service["healthPath"],
                headers={"User-Agent": "Barrels-Availability/1"},
            ),
            timeout=10,
        ) as response:
            result["httpStatus"] = response.status
            good = response.status == service["expectedStatus"]
            if service.get("expectedBody"):
                body = json.loads(response.read(8192))
                good = (
                    good
                    and isinstance(body, dict)
                    and all(
                        body.get(k) == v for k, v in service["expectedBody"].items()
                    )
                )
            result["status"] = "up" if good else "down"
    except urllib.error.HTTPError as error:
        result.update(status="down", httpStatus=error.code)
    except (OSError, ValueError, urllib.error.URLError):
        result["status"] = "down"
    return result


def transition(previous, status):
    """Two consecutive failures open once; recovery is emitted once."""
    previous = previous or {"failures": 0, "incident": False}
    if status not in {"up", "down"}:
        return previous, None
    failures = previous["failures"] + 1 if status == "down" else 0
    incident = previous["incident"]
    event = None
    if failures >= 2 and not incident:
        incident, event = True, "opened"
    elif status == "up" and incident:
        incident, event = False, "recovered"
    return {"failures": min(failures, 2), "incident": incident}, event


def ping(url):
    # Heartbeat tokens are credentials: never print URL or response/error content.
    from urllib.parse import urlsplit

    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname
        not in {"uptime.betterstack.com", "incidents.betterstack.com"}
        or not parsed.path.startswith("/api/v1/heartbeat/")
        or parsed.query
        or parsed.username
    ):
        raise ValueError("Unsupported heartbeat endpoint")
    with urllib.request.build_opener(NoRedirect()).open(url, timeout=10) as response:
        if response.status != 200:
            raise ValueError("Heartbeat rejected")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--environment", choices=["development", "staging", "production"], required=True
    )
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--state", type=Path, required=True)
    args = parser.parse_args()
    catalogue = json.loads(CATALOGUE.read_text())
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(
            executor.map(
                lambda service: check(service, args.environment), catalogue["services"]
            )
        )
    previous = json.loads(args.state.read_text()) if args.state.exists() else {}
    maintenance = json.loads(os.environ.get("PROBE_MAINTENANCE", "{}"))
    now = datetime.now(timezone.utc)
    for result in results:
        window = maintenance.get(result["app"])
        if window and datetime.fromisoformat(
            window["start"]
        ) <= now < datetime.fromisoformat(window["end"]):
            result["status"] = "maintenance"
    state, transitions = {}, []
    for result in results:
        key = f"{args.environment}/{result['app']}"
        state[key], event = transition(previous.get(key), result["status"])
        for field in ("episode", "providerId", "delivery"):
            if field in previous.get(key, {}):
                state[key][field] = previous[key][field]
        if state[key]["incident"] and (
            not state[key].get("episode") or state[key].get("delivery") == "resolved"
        ):
            # Preserve an unresolved provider episode across a brief recovery.
            # Also adopt failures recorded by the older local-only runner.
            state[key].update(episode=uuid4().hex, delivery="pending")
            state[key].pop("providerId", None)
        if event:
            transitions.append(
                {"app": result["app"], "owner": result["owner"], "event": event}
            )
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.state.parent.mkdir(parents=True, exist_ok=True)

    # Caller uses distinct paths per environment. Replace atomically.
    def persist():
        temporary = args.state.with_suffix(".tmp")
        temporary.write_text(json.dumps(state))
        temporary.replace(args.state)

    persist()
    incident_delivery = True
    incidents_enabled = os.environ.get("PROBE_INCIDENTS_ENABLED") == "true"
    if incidents_enabled:
        from incidents import reconcile

        for result in results:
            key = f"{args.environment}/{result['app']}"
            if result["status"] not in {"up", "down"} or not state[key].get("episode"):
                continue
            try:
                incident_delivery = (
                    reconcile(state[key], args.environment, result["app"], persist)
                    and incident_delivery
                )
            except (OSError, ValueError, KeyError):
                incident_delivery = False
        persist()
    # This path contains only this runner's new governed journal; never legacy data.
    from journal import compact

    records = (
        [json.loads(line) for line in args.output.read_text().splitlines()]
        if args.output.exists()
        else []
    )
    records.append({"results": results, "transitions": transitions})
    retained = [
        json.dumps(record) for record in compact(records, datetime.now(timezone.utc))
    ]
    journal = args.output.with_suffix(".tmp")
    journal.write_text("\n".join(retained) + "\n")
    journal.replace(args.output)
    print(json.dumps({"results": results, "transitions": transitions}))
    # A failed target must never be hidden by an overall successful heartbeat.
    checked = [
        r
        for r in results
        if r["status"] not in {"pending", "protection-only-unverified", "maintenance"}
    ]
    healthy = bool(checked) and all(r["status"] == "up" for r in checked)
    url = os.environ.get("PROBE_HEARTBEAT_URL")
    # With per-target incidents enabled, the heartbeat means runner + delivery health.
    successful = (
        any(r["status"] in {"up", "down", "maintenance"} for r in results)
        and incident_delivery
        if incidents_enabled
        else healthy
    )
    if successful and url:
        ping(url)
    return 0 if successful else 1


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, KeyError, TypeError):
        raise SystemExit(
            "Probe execution or monitoring delivery failed; no credential-bearing endpoint was logged."
        ) from None
