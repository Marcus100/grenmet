#!/usr/bin/env python3
"""Owner-separated aggregate reports. Missing/stale samples are unknown, never zero."""

import argparse
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
from probe import CATALOGUE

METRICS = {
    "product_funnels": "PostHog",
    "engagement": "GA4",
    "retention": "PostHog",
    "new_errors": "Sentry",
    "regressions": "Sentry",
    "slow_routes": "Redis operational counters",
    "failed_jobs": "Redis operational counters",
    "backup_age": "verified backup heartbeat",
    "ci_duration": "GitHub Actions",
    "failed_checks": "GitHub Actions",
    "deployments": "deployment provider",
    "quota_use": "provider account",
}


def build_reports(catalogue, samples, now, monthly=()):
    owners = {}
    for service in catalogue["services"]:
        rows = []
        for environment, config in service["environments"].items():
            for hours in [24, 168]:
                start = now - timedelta(hours=hours)
                valid = []
                for sample in samples:
                    try:
                        stamp = datetime.fromisoformat(sample["timestamp"])
                        if (
                            sample["app"] == service["id"]
                            and sample["environment"] == environment
                            and start <= stamp <= now
                            and sample["status"] in {"up", "down"}
                        ):
                            valid.append((stamp, sample["status"]))
                    except (KeyError, ValueError, TypeError):
                        continue
                valid = list(set(valid))
                fresh = bool(valid) and max(s[0] for s in valid) >= now - timedelta(
                    minutes=10
                )
                failures = sum(status == "down" for _, status in valid)
                coverage = min(1, len(valid) / (hours * 12))
                rows.append(
                    {
                        "environment": environment,
                        "window": {"start": start.isoformat(), "end": now.isoformat()},
                        "availability": {
                            "source": "scheduled-probe",
                            "completeness": "partial" if fresh else "unknown",
                            "coverage": coverage,
                            "samples": len(valid),
                            "failures": failures if valid else None,
                            "sampledAvailability": (len(valid) - failures) / len(valid)
                            if fresh
                            else None,
                        },
                        "coverageStatus": {
                            k: config[k]["status"]
                            for k in ["analytics", "sentry", "availability"]
                        },
                        "metrics": {
                            metric: {
                                "value": None,
                                "source": source,
                                "completeness": "unknown",
                            }
                            for metric, source in METRICS.items()
                        },
                    }
                )
        owners.setdefault(service["owner"], []).append(
            {"app": service["id"], "windows": rows}
        )
    return {
        owner: {
            "owner": owner,
            "generatedAt": now.isoformat(),
            "services": services,
            "monthly": [row for row in monthly if row.get("owner") == owner],
        }
        for owner, services in owners.items()
    }


def markdown(report):
    lines = [
        f"# Monitoring: {report['owner']}",
        "",
        f"Generated {report['generatedAt']}. Probe samples are not unique visitors.",
        "",
        "| App | Environment | Window start | Window end | Probe failures | Completeness |",
        "| --- | --- | --- | --- | --- | --- |",
    ]
    for service in report["services"]:
        for row in service["windows"]:
            metric = row["availability"]
            failures = (
                metric["failures"] if metric["failures"] is not None else "unknown"
            )
            lines.append(
                f"| {service['app']} | {row['environment']} | {row['window']['start']} | {row['window']['end']} | {failures} | {metric['completeness']} |"
            )
    lines += [
        "",
        "Source: scheduled-probe. Provider analytics, errors, timings, jobs, backups, CI, deployments and quotas are unknown until a verified provider export is available. JSON contains source and completeness for each metric. No historical data is inferred from SDK installation.",
    ]
    return "\n".join(lines) + "\n"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--samples", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    samples, monthly = [], []
    if args.samples and args.samples.exists():
        for line in args.samples.read_text().splitlines():
            record = json.loads(line)
            samples.extend(record.get("results", []))
            monthly.extend(record.get("monthly", []))
    reports = build_reports(
        json.loads(CATALOGUE.read_text()), samples, datetime.now(timezone.utc), monthly
    )
    args.output.mkdir(parents=True, exist_ok=True)
    for owner, report in reports.items():
        (args.output / f"{owner}.json").write_text(json.dumps(report, indent=2) + "\n")
        (args.output / f"{owner}.md").write_text(markdown(report))


if __name__ == "__main__":
    main()
