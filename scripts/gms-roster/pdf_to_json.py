# /// script
# requires-python = ">=3.11"
# dependencies = ["pdfplumber>=0.11"]
# ///
"""Convert a GMS monthly duty-roster PDF into the versioned JSON interchange file.

This is an OFFLINE, human-run step. PDFs never reach the server: a person runs
this at a desk, reviews the validation report, and uploads the JSON. The hosted
side ingests JSON only.

Column position is derived from x-coordinates, never from text order. The roster
template contains rows that start mid-month (a person who joins partway through),
and text-order parsing shifts such a row's whole month silently.

Usage:

    uv run --no-project scripts/gms-roster/pdf_to_json.py \
        "temp-files/gms-roster/September 2026.pdf" -o out/2026-09.json

`--no-project` keeps this off the monorepo Python workspace; pdfplumber is
declared inline above and never enters pyproject.toml or the API image.

Exit codes: 0 = clean, 1 = usage/IO error, 2 = validation blocked.
"""

import argparse
import calendar
import hashlib
import json
import re
import sys
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import pdfplumber

SCHEMA_VERSION = "gms.roster.v1"
CONVERTER_VERSION = "gms-roster-pdf/0.1.0"

WEEKDAY_INITIAL = {0: "M", 1: "T", 2: "W", 3: "T", 4: "F", 5: "S", 6: "S"}
MONTHS = {m.lower(): i for i, m in enumerate(calendar.month_name) if m}


def cluster_rows(chars: list[dict], tol: float = 2.5) -> list[list[dict]]:
    """Group characters into visual rows by their `top` coordinate."""
    rows: list[list[dict]] = []
    for char in sorted(chars, key=lambda c: c["top"]):
        if rows and abs(char["top"] - rows[-1][0]["top"]) <= tol:
            rows[-1].append(char)
        else:
            rows.append([char])
    return rows


def snap(x: float, columns: list[tuple[int, float]]) -> int:
    """Snap an x-midpoint to the nearest day column."""
    return min(columns, key=lambda kv: abs(kv[1] - x))[0]


def extract(pdf_path: Path) -> dict[str, Any]:
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[0]
        words = page.extract_words()
        chars = page.chars
        text = page.extract_text() or ""

    header = [w for w in words if 195 < w["top"] < 232 and w["text"].strip().isdigit()]
    if not header:
        raise SystemExit("Could not locate the day-number header row")
    columns = sorted(
        ((int(w["text"]), (w["x0"] + w["x1"]) / 2) for w in header),
        key=lambda kv: kv[1],
    )
    name_cutoff = min(c for _, c in columns) - 20

    # Weekday letters sit just above the day numbers, on the "Names /" line.
    # The header always prints 5 blocks of 7 letters (35 slots) but a month has
    # at most 31 day columns, so the leading/trailing unused slots have no day.
    # Map each DAY COLUMN to its nearest letter -- never letters to columns, or
    # an unused trailing slot silently overwrites the last real day.
    letters = [
        ((c["x0"] + c["x1"]) / 2, c["text"].strip())
        for c in chars
        if 190 < c["top"] < 200
        and (c["x0"] + c["x1"]) / 2 >= name_cutoff
        and c["text"].strip() in {"S", "M", "T", "W", "F"}
    ]
    spacings = [b - a for (_, a), (_, b) in zip(columns, columns[1:])]
    tolerance = (sorted(spacings)[len(spacings) // 2] / 2) if spacings else 10.0
    weekdays: dict[int, str] = {}
    for day, centre in columns:
        if not letters:
            break
        distance, letter = min((abs(x - centre), t) for x, t in letters)
        if distance <= tolerance:
            weekdays[day] = letter

    people: list[dict[str, Any]] = []
    for row in cluster_rows([c for c in chars if 220 < c["top"] < 530]):
        name_chars = sorted(
            (c for c in row if (c["x0"] + c["x1"]) / 2 < name_cutoff),
            key=lambda c: c["x0"],
        )
        raw_name = "".join(c["text"] for c in name_chars).strip()
        if not raw_name:
            continue
        cadet = raw_name.startswith("*")
        # Collapse the double spaces the template carries (e.g. "T.  Mitchell").
        name = re.sub(r"\s+", " ", raw_name.lstrip("*")).strip()

        codes: dict[int, str] = {}
        for char in sorted(
            (c for c in row if (c["x0"] + c["x1"]) / 2 >= name_cutoff),
            key=lambda c: c["x0"],
        ):
            token = char["text"].strip().upper()
            if token:
                codes[snap((char["x0"] + char["x1"]) / 2, columns)] = token
        people.append({"roster_name": name, "cadet": cadet, "codes": codes})

    period = None
    if match := re.search(r"PERIOD:\s*([A-Za-z]+)\s+(\d{4})", text):
        month = MONTHS.get(match.group(1).lower())
        if month:
            period = (int(match.group(2)), month)

    return {
        "columns": [d for d, _ in columns],
        "weekdays": weekdays,
        "people": people,
        "period_in_pdf": period,
    }


def validate(
    extracted: dict[str, Any],
    year: int,
    month: int,
    people: dict[str, dict],
    legend: dict[str, dict],
) -> list[dict[str, Any]]:
    days = calendar.monthrange(year, month)[1]
    columns = extracted["columns"]
    checks: list[dict[str, Any]] = []

    def add(cid: str, ok: bool, severity: str, detail: str, **extra: Any) -> None:
        checks.append(
            {"id": cid, "status": "pass" if ok else severity, "detail": detail, **extra}
        )

    # 1. Column count vs real month length.
    add(
        "column_count",
        len(columns) == days,
        "warn",
        f"{len(columns)} day columns for a {days}-day month"
        + ("" if len(columns) == days else " (stale template)"),
    )

    # 2. Codes sitting in columns past the end of the month. Blocking: those
    #    codes are indistinguishable from real shifts and must not be guessed at.
    overflow = {
        p["roster_name"]: {d: c for d, c in p["codes"].items() if d > days}
        for p in extracted["people"]
    }
    overflow = {n: v for n, v in overflow.items() if v}
    add(
        "overflow_codes",
        not overflow,
        "block",
        f"{len(overflow)} people carry codes beyond day {days}",
        affected=overflow,
    )

    # 3. Missing columns silently truncate the month -- never overridable.
    add(
        "missing_columns",
        len(columns) >= days,
        "block",
        f"template covers {len(columns)} of {days} days",
    )

    # 4. Weekday checksum: the printed weekday letters vs the real calendar.
    #    Catches a stale template and any whole-row column shift.
    mismatched = {
        d: (got, WEEKDAY_INITIAL[date(year, month, d).weekday()])
        for d, got in extracted["weekdays"].items()
        if d <= days and got != WEEKDAY_INITIAL[date(year, month, d).weekday()]
    }
    add(
        "weekday_alignment",
        not mismatched,
        "block",
        f"{len(mismatched)} day columns disagree with the {year}-{month:02d} calendar",
        mismatched=mismatched,
    )

    # 5. Unknown shift codes.
    unknown = sorted(
        {c for p in extracted["people"] for c in p["codes"].values() if c not in legend}
    )
    add("known_codes", not unknown, "block", f"unrecognised codes: {unknown}")

    # 6. Every name must resolve to an account via the alias map.
    unresolved = sorted(
        p["roster_name"] for p in extracted["people"] if p["roster_name"] not in people
    )
    add(
        "name_resolution",
        not unresolved,
        "block",
        f"unresolved roster names: {unresolved}",
    )

    # 7. Duplicate rows.
    names = [p["roster_name"] for p in extracted["people"]]
    dupes = sorted({n for n in names if names.count(n) > 1})
    add("unique_rows", not dupes, "block", f"duplicate rows: {dupes}")

    # 8. Cadet marker agrees with the alias file.
    drift = {
        p["roster_name"]: {
            "pdf_marker": p["cadet"],
            "profile_grade": people[p["roster_name"]].get("grade"),
        }
        for p in extracted["people"]
        if p["roster_name"] in people
        and p["cadet"] != (people[p["roster_name"]].get("grade") == "CADET")
    }
    add("cadet_agreement", not drift, "warn", f"cadet flag drift: {drift}")

    return checks


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdf", type=Path)
    parser.add_argument("--month", help="YYYY-MM; inferred from the PDF when omitted")
    parser.add_argument(
        "--profile",
        type=Path,
        default=Path(__file__).parent / "profiles" / "gms.json",
        help="department profile: legend, grades and roster-name -> account map",
    )
    parser.add_argument("-o", "--output", type=Path)
    parser.add_argument(
        "--allow-overflow",
        action="store_true",
        help="discard codes past the end of the month (records the discard in the file)",
    )
    args = parser.parse_args()

    if not args.pdf.is_file():
        print(f"error: no such file: {args.pdf}", file=sys.stderr)
        return 1

    profile = json.loads(args.profile.read_text())
    legend = profile["legend"]
    roster_people = {p["roster_name"]: p for p in profile["people"]}

    extracted = extract(args.pdf)
    if args.month:
        year, month = int(args.month[:4]), int(args.month[5:7])
    elif extracted["period_in_pdf"]:
        year, month = extracted["period_in_pdf"]
    else:
        print("error: could not infer period; pass --month YYYY-MM", file=sys.stderr)
        return 1

    days = calendar.monthrange(year, month)[1]
    checks = validate(extracted, year, month, roster_people, legend)
    blocking = [c for c in checks if c["status"] == "block"]
    if args.allow_overflow:
        blocking = [c for c in blocking if c["id"] != "overflow_codes"]

    people = []
    for person in extracted["people"]:
        known = roster_people.get(person["roster_name"], {})
        kept = {str(d): c for d, c in sorted(person["codes"].items()) if d <= days}
        dropped = {str(d): c for d, c in sorted(person["codes"].items()) if d > days}
        people.append(
            {
                "roster_name": person["roster_name"],
                "official_name": known.get("official_name", person["roster_name"]),
                "full_name": known.get("full_name"),
                "username": known.get("username"),
                "grade": known.get("grade"),
                "cadet": known.get("grade") == "CADET",
                "assignments": kept,
                "discarded_assignments": dropped,
            }
        )

    document = {
        "schema_version": SCHEMA_VERSION,
        "organisation": profile.get("organisation"),
        "department": profile.get("department"),
        "grades": profile.get("grades"),
        "period": {
            "month": f"{year}-{month:02d}",
            "start": date(year, month, 1).isoformat(),
            "end": date(year, month, days).isoformat(),
            "days_in_month": days,
        },
        "source": {
            "filename": args.pdf.name,
            "sha256": hashlib.sha256(args.pdf.read_bytes()).hexdigest(),
            "converter": CONVERTER_VERSION,
            "converted_at": datetime.now(timezone.utc).isoformat(),
            "overflow_discarded": bool(args.allow_overflow),
        },
        "legend": legend,
        "validation": {
            "status": "blocked" if blocking else "ok",
            "checks": checks,
        },
        "people": people,
    }

    payload = json.dumps(document, indent=2, sort_keys=False)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(payload + "\n")
    else:
        print(payload)

    for check in checks:
        if check["status"] != "pass":
            print(
                f"  [{check['status'].upper():5}] {check['id']}: {check['detail']}",
                file=sys.stderr,
            )
    if blocking:
        print(
            f"\nBLOCKED: {len(blocking)} check(s) failed; nothing should be imported.",
            file=sys.stderr,
        )
        return 2
    print(
        f"\nOK: {len(people)} people, {days} days -> {args.output or 'stdout'}",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
