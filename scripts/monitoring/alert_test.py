#!/usr/bin/env python3
"""Manually dispatched synthetic acceptance; API success is not email receipt."""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path

from incidents import request


def exercise(environment, api=request, operation="open", incident_id=""):
    if environment not in {"staging", "production"} or operation not in {
        "open",
        "resolve",
    }:
        raise ValueError("Invalid synthetic test operation")
    title = f"TEST ONLY · {environment} · CI monitoring acceptance"
    report = {
        "environment": environment,
        "release": os.environ.get("GITHUB_SHA", "unknown"),
        "source": "Better Stack incidents API",
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "emailReceipt": "unknown-owner-confirmation-required",
        "recoveryReceipt": "unknown-owner-confirmation-required",
        "status": "failed",
    }
    if operation == "open":
        if incident_id:
            raise ValueError("Opening a test cannot take an incident ID")
        response = api(
            "POST",
            "incidents",
            {
                "name": title,
                "summary": "Controlled monitoring acceptance test. No application outage has occurred.",
                "requester_email": "euginegnd@gmail.com",
                "email": True,
                "call": False,
                "sms": False,
                "push": False,
                "critical_alert": False,
            },
        )
        identity = str(response["data"]["id"])
    else:
        identity = incident_id
        if not identity.isascii() or not identity.isdigit():
            raise ValueError("Invalid synthetic incident ID")
        response = api("GET", f"incidents/{identity}")
        if (
            str(response["data"]["id"]) != identity
            or response["data"]["attributes"].get("name") != title
        ):
            raise ValueError("Refusing to resolve a non-matching test incident")
        api(
            "POST",
            f"incidents/{identity}/resolve",
            {"resolved_by": "CI-controlled-acceptance-test"},
        )
    if not identity.isascii() or not identity.isdigit():
        raise ValueError("Invalid synthetic incident ID")
    report["incidentId"] = identity
    report["dashboard"] = (
        f"https://incidents.betterstack.com/team/t476349/incidents/{identity}"
    )
    report["status"] = (
        "opened-awaiting-email-confirmation"
        if operation == "open"
        else "resolved-awaiting-recovery-confirmation"
    )
    report["completedAt"] = datetime.now(timezone.utc).isoformat()
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--environment", choices=["staging", "production"], required=True
    )
    parser.add_argument("--operation", choices=["open", "resolve"], required=True)
    parser.add_argument("--incident-id", default="")
    args = parser.parse_args()
    report = exercise(
        args.environment, operation=args.operation, incident_id=args.incident_id
    )
    text = json.dumps(report, indent=2) + "\n"
    print(text)
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with Path(os.environ["GITHUB_STEP_SUMMARY"]).open("a") as output:
            output.write(text)


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, KeyError):
        raise SystemExit(
            "Synthetic acceptance failed. Check Better Stack for an unresolved TEST ONLY incident; no delivery evidence is claimed."
        ) from None
