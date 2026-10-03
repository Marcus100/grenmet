#!/usr/bin/env python3
"""Read-only CLI evidence; output counts/timestamps, never issue text or identities."""

import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import subprocess


def run_json(command):
    try:
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=30, check=True
        )
        return json.loads(result.stdout)
    except (OSError, ValueError, subprocess.SubprocessError):
        return None


def github_summary(rows, start, end):
    if rows is None:
        return {
            "source": "GitHub Actions",
            "completeness": "unknown",
            "runs": None,
            "failed": None,
        }
    selected = [
        r
        for r in rows
        if start <= datetime.fromisoformat(r["createdAt"].replace("Z", "+00:00")) <= end
    ]
    return {
        "source": "GitHub Actions",
        "scope": "repository-shared",
        "completeness": "partial" if len(rows) == 100 else "complete",
        "runs": len(selected),
        "failed": sum(r.get("conclusion") == "failure" for r in selected),
        "inProgress": sum(r.get("status") != "completed" for r in selected),
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    now = datetime.now(timezone.utc)
    rows = run_json(
        [
            "gh",
            "run",
            "list",
            "--repo",
            "Marcus100/grenmet",
            "--limit",
            "100",
            "--json",
            "createdAt,status,conclusion",
        ]
    )
    report = {
        "generatedAt": now.isoformat(),
        "scope": "repository-shared-operational",
        "windows": [],
    }
    for hours in [24, 168]:
        start = now - timedelta(hours=hours)
        report["windows"].append(
            {
                "start": start.isoformat(),
                "end": now.isoformat(),
                "ci": github_summary(rows, start, now),
            }
        )
    report["sentry"] = []
    for environment in ["staging", "production"]:
        for period in ["24h", "7d"]:
            data = run_json(
                [
                    "sentry",
                    "issue",
                    "list",
                    f"grenmet/grenmet-{environment}",
                    "--period",
                    period,
                    "--json",
                    "--fields",
                    "id,firstSeen,lastSeen,status",
                    "--limit",
                    "100",
                ]
            )
            report["sentry"].append(
                {
                    "environment": environment,
                    "period": period,
                    "source": "Sentry CLI",
                    "ownerAttribution": "unverified-legacy-project",
                    "activeIssueGroups": len(data["data"])
                    if data and "data" in data
                    else None,
                    "completeness": "partial"
                    if data and data.get("hasMore")
                    else "complete"
                    if data and "data" in data
                    else "unknown",
                }
            )
    args.output.write_text(json.dumps(report, indent=2) + "\n")


if __name__ == "__main__":
    main()
