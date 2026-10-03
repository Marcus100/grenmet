"""Atomic-journal compaction: 14-day samples and at most 24 monthly aggregates."""

from datetime import datetime, timedelta


def compact(records, now):
    cutoff = now - timedelta(days=14)
    minimum_month = now.year * 12 + now.month - 23
    totals, retained = {}, []
    for record in records:
        for row in record.get("monthly", []):
            year, month = map(int, row["month"].split("-"))
            if year * 12 + month >= minimum_month:
                key = (
                    row["month"],
                    row["owner"],
                    row["environment"],
                    row["app"],
                    row["status"],
                )
                totals[key] = totals.get(key, 0) + row["samples"]
        recent = []
        for item in record.get("results", []):
            stamp = datetime.fromisoformat(item["timestamp"])
            if stamp >= cutoff:
                recent.append(item)
            elif stamp.year * 12 + stamp.month >= minimum_month:
                key = (
                    stamp.strftime("%Y-%m"),
                    item["owner"],
                    item["environment"],
                    item["app"],
                    item["status"],
                )
                totals[key] = totals.get(key, 0) + 1
        if recent:
            retained.append(
                {"results": recent, "transitions": record.get("transitions", [])}
            )
    monthly = [
        {
            "month": key[0],
            "owner": key[1],
            "environment": key[2],
            "app": key[3],
            "status": key[4],
            "samples": count,
            "source": "scheduled-probe",
            "completeness": "sampled",
        }
        for key, count in sorted(totals.items())
    ]
    return [{"monthly": monthly}] + retained
