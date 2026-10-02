"""Rebuild checked imports, CSV downloads, trend measures and validation reports."""

import csv
import hashlib
import io
import json
import subprocess
from pathlib import Path

from archive import APP, GENERATED, SOURCE, Archive, read
from elections import election_rows
from features import features
from stations import station_rows
from validation import validate


def json_text(value):
    return json.dumps(value, ensure_ascii=False, indent=2) + "\n"


def digest(path):
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


def csv_text(rows):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=list(rows[0]), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
    return buffer.getvalue()


def build():
    archive = Archive()
    results = archive.results()
    referendum = archive.referendum()
    register = archive.register()
    geo = archive.geo()
    discrepancies = archive.discrepancies()
    dates = {e["id"]: e["date"] for e in read(SOURCE / "reference/events.json")}
    contests, candidates = election_rows(results, referendum, dates)
    references = {
        name: read(SOURCE / f"verification/{name}.json")
        for name in ("gazette-winners", "newsletter-1990", "recorded-totals")
    }
    expected_inputs = (
        archive.inputs
        | {SOURCE / "reference/events.json"}
        | {SOURCE / f"verification/{name}.json" for name in references}
    )
    actual_inputs = {p for p in SOURCE.rglob("*.json") if p.name != "campaign.json"}
    if expected_inputs != actual_inputs:
        raise ValueError(
            f"Unconsumed or missing source records: {actual_inputs ^ expected_inputs}"
        )
    report = validate(
        results, referendum, register, geo, candidates, contests, references
    )
    if report["summary"]["fail"]:
        failures = [check for check in report["checks"] if check["status"] == "fail"]
        raise ValueError(f"Archive validation failed: {failures}")
    outputs = {GENERATED / f"{name}.ts": text for name, text in archive.modules.items()}
    outputs[GENERATED / "features.json"] = json_text(
        features(contests, list(results["results"]))
    )
    outputs[GENERATED / "validation.json"] = json_text(report)
    downloads = {
        "contests": contests,
        "candidates": candidates,
        "stations": station_rows(results, referendum),
        "register": [
            {
                "snapshot": s["date"],
                "list": s["file"],
                "division": d,
                "constituency_code": d[0],
                "electors": v[0],
                "female": v[1],
                "male": v[2],
            }
            for s in register["snapshots"]
            for d, v in sorted(s["div"].items())
        ],
        "discrepancies": [
            {
                "id": d["id"],
                "area": d["area"],
                "status": d["status"],
                "impact": d["impact"],
                "finding": d["what"],
                "action": d["action"],
                "sources": "; ".join(d["sources"]),
            }
            for d in discrepancies["items"]
        ],
    }
    for name, rows in downloads.items():
        outputs[APP / f"public/data/master_{name}.csv"] = csv_text(rows)
    for path, text in outputs.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8", newline="")
    # Use the repository formatter; production builds only check, never need Python.
    subprocess.run(
        [
            "pnpm",
            "exec",
            "biome",
            "check",
            "--write",
            *[str(p) for p in outputs if p.suffix in (".json", ".ts")],
        ],
        cwd=APP,
        check=True,
    )
    inputs = sorted(p for p in SOURCE.rglob("*.json") if p.name != "campaign.json")
    inputs += sorted(Path(__file__).parent.glob("*.py"))
    manifest = {
        key: {p.relative_to(APP).as_posix(): digest(p) for p in paths}
        for key, paths in [("inputs", inputs), ("outputs", sorted(outputs))]
    }
    (GENERATED / "manifest.json").write_text(json_text(manifest))
    subprocess.run(
        [
            "pnpm",
            "exec",
            "biome",
            "format",
            "--write",
            str(GENERATED / "manifest.json"),
        ],
        cwd=APP,
        check=True,
    )
    print(
        f"Built {len(outputs)} outputs from {len(inputs)} inputs; {report['summary']}"
    )


if __name__ == "__main__":
    build()
