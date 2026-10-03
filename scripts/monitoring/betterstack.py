#!/usr/bin/env python3
"""Plan/apply only explicitly declared resources; never delete or alter billing."""

import argparse
import json
import os
from pathlib import Path
import re
import urllib.request

BASE = "https://incidents.betterstack.com/api/v2/"


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def request(method, path, body=None):
    if not re.fullmatch(
        r"(monitors|heartbeats)(/[0-9]+|\?page=[0-9]+&per_page=100&team_id=[0-9]+)?",
        path,
    ):
        raise ValueError("Unsupported provider endpoint")
    req = urllib.request.Request(
        BASE + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={
            "Authorization": "Bearer " + os.environ["BETTERSTACK_API_TOKEN"],
            "Content-Type": "application/json",
        },
    )
    with urllib.request.build_opener(NoRedirect()).open(req, timeout=20) as response:
        return json.load(response)


def plan(config, environment, live):
    changes, seen = [], set()
    for resource in config["resources"]:
        kind, identity, settings = (
            resource["kind"],
            resource.get("id"),
            resource["settings"],
        )
        if kind not in ("monitors", "heartbeats") or resource["environment"] not in (
            "staging",
            "production",
        ):
            raise ValueError("Invalid resource scope")
        name_key = "name" if kind == "heartbeats" else "pronounceable_name"
        name = settings[name_key]
        if not name.startswith(resource["environment"].capitalize() + " · "):
            raise ValueError("Resource name must declare its environment")
        key = (kind, identity or name)
        if key in seen:
            raise ValueError("Duplicate resource declaration")
        seen.add(key)
        if resource["environment"] != environment:
            continue
        if identity:
            if not re.fullmatch("[0-9]+", str(identity)):
                raise ValueError("Invalid provider ID")
            found = [item for item in live[kind] if str(item["id"]) == str(identity)]
            if len(found) != 1 or found[0]["attributes"][name_key] != name:
                raise ValueError("Declared resource ownership cannot be verified")
            attrs = found[0]["attributes"]
            delta = {
                key: value
                for key, value in settings.items()
                if (
                    attrs.get("paused_at") is not None
                    if key == "paused"
                    else attrs.get(key)
                )
                != value
            }
            if delta:
                changes.append(
                    {"method": "PATCH", "path": f"{kind}/{identity}", "settings": delta}
                )
        else:
            if any(item["attributes"][name_key] == name for item in live[kind]):
                raise ValueError("Existing resource requires explicit ID adoption")
            if not config["limitsVerified"] or settings.get("paused") is not True:
                raise ValueError(
                    "New resources require verified free limits and must start paused"
                )
            changes.append(
                {
                    "method": "POST",
                    "path": kind,
                    "settings": dict(settings, team_id=config["teamId"]),
                }
            )
    for kind in ("monitors", "heartbeats"):
        creates = sum(
            change["method"] == "POST" and change["path"] == kind for change in changes
        )
        if creates and len(live[kind]) + creates > config["limits"][kind]:
            raise ValueError("Free quota would be exceeded")
    return changes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--environment", choices=["staging", "production"], required=True
    )
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    config = json.loads(Path(__file__).with_name("betterstack.json").read_text())
    live = {}
    for kind in ("monitors", "heartbeats"):
        live[kind] = []
        for page in range(1, 101):
            response = request(
                "GET", f"{kind}?page={page}&per_page=100&team_id={config['teamId']}"
            )
            live[kind].extend(response["data"])
            if (
                not response.get("pagination", {}).get("next")
                and len(response["data"]) < 100
            ):
                break
        else:
            raise ValueError("Incomplete provider inventory")
    changes = plan(config, args.environment, live)
    print(
        json.dumps(
            {
                "environment": args.environment,
                "changes": changes,
                "limitsVerified": config["limitsVerified"],
                "usage": {kind: len(rows) for kind, rows in live.items()},
            },
            indent=2,
        )
    )
    if args.apply:
        for change in changes:
            result = request(change["method"], change["path"], change["settings"])
            # Returned heartbeat URLs are credentials: print only resource IDs.
            print(json.dumps({"applied": change["method"], "id": result["data"]["id"]}))


if __name__ == "__main__":
    try:
        main()
    except (OSError, KeyError, ValueError):
        raise SystemExit(
            "Provider reconciliation failed; check declared IDs, access and free quota. No response payload or credential was logged."
        ) from None
