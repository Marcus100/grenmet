#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["anthropic>=0.69"]
# ///
"""Extract WMO SYNOP surface-observation register sheets to CSV via Claude vision.

The PNGs in this directory are scanned/photographed GMS synoptic surface
observation registers — dense, handwritten, multi-coloured numeric tables laid
out as WMO-306 (FM 12 SYNOP) code groups. This script sends each image to the
Claude API and asks it to transcribe every observation row into a fixed set of
named fields, then writes one CSV row per observation.

Column meaning follows the two WMO source summaries used as guidance:
  - wmo-306-i1-codes-2019.md  (code construction: how each group is built)
  - wmo-49-ii-aviation-met-2018.md  (service rules for METAR/SPECI/TAF)

Input: COMBINED sheets (left = Section 0/1, right = Section 3, rows aligned),
produced by align_combine.py as `synop_day*_combined.png`. Each row is read
straight across both halves so one CSV row holds the whole observation. To
transcribe a single half instead, pass it explicitly as an argument.

Usage (uv resolves the anthropic dependency from the inline metadata above):
    export ANTHROPIC_API_KEY=sk-ant-...
    uv run extract.py                       # synop_day*_combined.png -> wxregister.csv
    uv run extract.py --out data.csv img1.png img2.png
    uv run extract.py --model claude-opus-4-8 --glob 'synop_day*_combined.png'

Designed so higher-resolution rescans drop in unchanged: point --glob at the new
files (or pass them as arguments) and rerun. Accuracy at the current ~624px
resolution is limited by the source; HD scans will improve it without code
changes.
"""

from __future__ import annotations

import argparse
import base64
import csv
import json
import mimetypes
import sys
from pathlib import Path
from typing import Any

MODEL = "claude-opus-4-8"

# Each entry: (csv_column, WMO code group / Section, human description).
# Order here is the order of columns in the output CSV. Fields map onto the
# FM 12 SYNOP Section 0 (identification) and Section 1 (core global data)
# groups described in wmo-306-i1-codes-2019.md. Every value is transcribed as
# written; blanks / illegible cells become empty.
COLUMNS: list[tuple[str, str, str]] = [
    ("source_image", "-", "Filename the row was read from"),
    ("row_index", "-", "1-based position of the row top-to-bottom on the sheet"),
    # --- Section 0: identification ---
    ("report_type", "MiMiMjMj", "Report indicator as printed, e.g. AAXX / SYNOP / METAR"),
    ("day", "YY", "Day of month of the observation"),
    ("time_utc", "GG", "Observation hour, UTC (whole hours)"),
    ("station_id", "IIiii", "WMO station identifier if present"),
    ("wind_indicator", "iw", "Wind speed units/source indicator"),
    # --- Section 1: core data for global exchange ---
    ("precip_indicator", "iR", "Precipitation group indicator"),
    ("station_wx_indicator", "ix", "Station type / weather-inclusion indicator"),
    ("cloud_base", "h", "Height of base of lowest cloud (code figure)"),
    ("visibility", "VV", "Horizontal visibility (code figure)"),
    ("total_cloud", "N", "Total cloud amount (oktas, code figure)"),
    ("wind_dir", "dd", "True wind direction (tens of degrees)"),
    ("wind_speed", "ff", "Wind speed in the iw units"),
    ("air_temp", "1snTTT", "Air temperature with sign, e.g. -2.3 or 27.4"),
    ("dew_point", "2snTdTdTd", "Dew-point temperature with sign"),
    ("station_pressure", "3P0P0P0P0", "Pressure at station level (hPa, tenths)"),
    ("msl_pressure", "4PPPP", "Mean sea-level pressure (hPa, tenths)"),
    ("pressure_tendency", "5a", "Characteristic of pressure tendency (a, code figure)"),
    ("pressure_change", "5ppp", "3-hour pressure change (tenths hPa)"),
    ("precip_amount", "6RRR", "Precipitation amount (code figure)"),
    ("precip_period", "6tR", "Duration-of-precip indicator (tR)"),
    ("present_wx", "7ww", "Present weather (ww code figure)"),
    ("past_wx_1", "7W1", "Past weather W1"),
    ("past_wx_2", "7W2", "Past weather W2"),
    ("low_cloud_amount", "8Nh", "Amount of low (or middle) cloud Nh"),
    ("low_cloud_type", "8CL", "Low cloud genus CL"),
    ("mid_cloud_type", "8CM", "Middle cloud genus CM"),
    ("high_cloud_type", "8CH", "High cloud genus CH"),
    # --- Section 3: regional / national data (back page; the RIGHT half of a
    #     combined sheet, under the printed "SECTION 3 / 333" header) ---
    ("s3_state_of_sky", "0", "Section 3: state-of-sky / cloud-development indicator group"),
    ("s3_cloud_dir_low", "DL", "Section 3: direction of low-cloud movement"),
    ("s3_cloud_dir_mid", "DM", "Section 3: direction of middle-cloud movement"),
    ("s3_cloud_dir_high", "DH", "Section 3: direction of high-cloud movement"),
    ("s3_max_temp", "1snTxTxTx", "Section 3: maximum temperature with sign"),
    ("s3_min_temp", "2snTnTnTn", "Section 3: minimum temperature with sign"),
    ("s3_baro_change_24h", "5appp", "Section 3: 24-hour barometric change group as written"),
    ("s3_rainfall_24h", "7RRR", "Section 3: 24-hour rainfall (00/06/12/18Z cells) as written"),
    ("s3_layer1_amount", "8Ns", "Section 3 cloud layer 1: amount of layer Ns"),
    ("s3_layer1_form", "C", "Section 3 cloud layer 1: genus/form C"),
    ("s3_layer1_height", "hshs", "Section 3 cloud layer 1: height of base hshs"),
    ("s3_layer2_amount", "8Ns", "Section 3 cloud layer 2: amount of layer Ns"),
    ("s3_layer2_form", "C", "Section 3 cloud layer 2: genus/form C"),
    ("s3_layer2_height", "hshs", "Section 3 cloud layer 2: height of base hshs"),
    ("s3_layer3_amount", "8Ns", "Section 3 cloud layer 3: amount of layer Ns"),
    ("s3_layer3_form", "C", "Section 3 cloud layer 3: genus/form C"),
    ("s3_layer3_height", "hshs", "Section 3 cloud layer 3: height of base hshs"),
    ("s3_layer4_amount", "8Ns", "Section 3 cloud layer 4: amount of layer Ns"),
    ("s3_layer4_form", "C", "Section 3 cloud layer 4: genus/form C"),
    ("s3_layer4_height", "hshs", "Section 3 cloud layer 4: height of base hshs"),
    ("s3_special_phenomena", "95SpSpspsp", "Section 3: special-phenomena group(s) as written"),
    ("s3_remarks", "-", "Section 3: remarks / plain-language additions / regional & national groups (right-most columns)"),
    # --- provenance ---
    ("notes", "-", "Transcription notes: illegible cells, ambiguities, extra columns"),
]

# Columns the model fills in (everything except the ones we set ourselves).
_MODEL_FIELDS = [c for c, _, _ in COLUMNS if c not in ("source_image", "row_index")]


def build_schema() -> dict[str, Any]:
    """JSON schema for structured outputs: an object with a `rows` array.

    Every field is a plain string (blanks are the empty string, not null).
    Nullable / union types are deliberately avoided: structured outputs caps a
    schema at 16 union-typed parameters, and we have far more columns than that.
    """
    properties = {field: {"type": "string"} for field in _MODEL_FIELDS}
    return {
        "type": "object",
        "properties": {
            "rows": {
                "type": "array",
                "items": {
                    "type": "object",
                    "properties": properties,
                    "required": _MODEL_FIELDS,
                    "additionalProperties": False,
                },
            }
        },
        "required": ["rows"],
        "additionalProperties": False,
    }


def build_prompt() -> str:
    """Transcription instructions, including the column dictionary."""
    lines = [
        "You are transcribing a scanned/photographed WMO SYNOP surface-observation",
        "register sheet (FM 12 SYNOP, per WMO-306 Vol I.1). It is a dense grid of",
        "handwritten, multi-coloured numeric data.",
        "",
        "The image is a COMBINED two-section sheet placed side by side, with the data",
        "rows aligned across the join:",
        "  - LEFT half  = SECTION 0 (identification) + SECTION 1 (core data), columns",
        "    laid out as the SYNOP code groups (report type, day, hour, station, wind,",
        "    temps, pressure, present/past weather, the 8NhCLCMCH cloud group).",
        "  - RIGHT half = SECTION 3 (regional / national), under the printed",
        "    'SECTION 3 / 333' header: state of sky and cloud-direction columns,",
        "    Maximum and Minimum temperature, 24-hour barometric change, 24-hour",
        "    rainfall, up to FOUR supplementary cloud-layer groups (each 8 Ns C hshs:",
        "    amount / form / height), a 95SpSpspsp special-phenomena group, and a wide",
        "    REMARKS column of plain-language / regional / national groups.",
        "",
        "Each observation is ONE row that runs straight across both halves: read the",
        "left-half cells and the right-half cells at the SAME vertical position into the",
        "same output row. Transcribe EVERY data row, top to bottom. Map each cell to the",
        "matching field by its column position / printed header.",
        "",
        "Rules:",
        "- Transcribe digits and signs EXACTLY as written. Do not 'correct' values.",
        "- Every field is a string. A blank or struck-through cell -> empty string \"\".",
        "  An illegible cell -> empty string \"\", and record it in `notes`.",
        "- Keep numbers as plain strings (e.g. '27.4', '-2.3', '1013', '08'). Do not add",
        "  units. Preserve leading zeros.",
        "- Temperatures: include the sign and decimal if shown.",
        "- Section 3 cloud layers are filled lowest-first: put the lowest layer in",
        "  s3_layer1_*, the next higher in s3_layer2_*, and so on. Leave unused layers empty.",
        "- The right-half REMARKS column is free text; copy it verbatim into s3_remarks.",
        "- If a row spans the page but some groups are empty, still emit the row with the",
        "  present fields filled and the rest as empty strings.",
        "- Use the `notes` field for anything uncertain: illegible cells, smudges,",
        "  values written in a different colour you are unsure about, or extra/unlabelled",
        "  columns you could not place.",
        "- Do NOT invent rows. If the sheet has 12 observation rows, return exactly 12.",
        "",
        "Field dictionary (csv_column — WMO group — meaning):",
    ]
    for col, group, desc in COLUMNS:
        if col in ("source_image", "row_index"):
            continue
        lines.append(f"- {col} — {group} — {desc}")
    return "\n".join(lines)


def encode_image(path: Path) -> tuple[str, str]:
    """Return (media_type, base64 data) for an image file."""
    media_type = mimetypes.guess_type(path.name)[0] or "image/png"
    data = base64.standard_b64encode(path.read_bytes()).decode("utf-8")
    return media_type, data


def extract_rows(client: Any, path: Path, *, model: str) -> list[dict[str, Any]]:
    """Send one image to Claude and return the transcribed rows for it."""
    media_type, data = encode_image(path)
    response = client.messages.create(
        model=model,
        max_tokens=16000,
        thinking={"type": "adaptive"},
        output_config={
            "effort": "high",
            "format": {"type": "json_schema", "schema": build_schema()},
        },
        messages=[
            {
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": data,
                        },
                    },
                    {"type": "text", "text": build_prompt()},
                ],
            }
        ],
    )

    if response.stop_reason == "refusal":
        detail = getattr(response, "stop_details", None)
        raise RuntimeError(f"Model refused to transcribe {path.name}: {detail}")

    text = next((b.text for b in response.content if b.type == "text"), None)
    if not text:
        raise RuntimeError(f"No text block returned for {path.name}")

    payload = json.loads(text)
    rows = payload.get("rows", [])

    for i, row in enumerate(rows, start=1):
        row["source_image"] = path.name
        row["row_index"] = str(i)
    return rows


def write_csv(rows: list[dict[str, Any]], out_path: Path) -> None:
    """Write rows to CSV using the canonical column order; missing -> empty."""
    fieldnames = [c for c, _, _ in COLUMNS]
    with out_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            writer.writerow({k: ("" if row.get(k) is None else row.get(k, "")) for k in fieldnames})


def resolve_inputs(args: argparse.Namespace) -> list[Path]:
    here = Path(__file__).resolve().parent
    if args.images:
        return [Path(p) for p in args.images]
    return sorted(here.glob(args.glob))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("images", nargs="*", help="Image files to process (default: --glob in this dir)")
    parser.add_argument("--glob", default="synop_day*_combined.png", help="Glob for input images when none are given (default: synop_day*_combined.png)")
    parser.add_argument("--out", default=None, help="Output CSV path (default: wxregister.csv beside this script)")
    parser.add_argument("--model", default=MODEL, help=f"Claude model id (default: {MODEL})")
    args = parser.parse_args(argv)

    inputs = resolve_inputs(args)
    if not inputs:
        print(f"No images matched (glob={args.glob!r}).", file=sys.stderr)
        return 1

    out_path = Path(args.out) if args.out else Path(__file__).resolve().parent / "wxregister.csv"

    try:
        import anthropic
    except ImportError:
        print("Missing dependency: pip install anthropic", file=sys.stderr)
        return 1

    # max_retries covers transient 429/5xx/529 (overloaded) with exponential backoff.
    client = anthropic.Anthropic(max_retries=6)  # reads ANTHROPIC_API_KEY from the environment

    all_rows: list[dict[str, Any]] = []
    failures: list[str] = []
    for path in inputs:
        if not path.exists():
            print(f"  skip (not found): {path}", file=sys.stderr)
            continue
        print(f"  transcribing {path.name} ...", file=sys.stderr)
        try:
            rows = extract_rows(client, path, model=args.model)
        except Exception as exc:  # keep going so one bad/overloaded image doesn't lose the rest
            print(f"    !! failed: {type(exc).__name__}: {exc}", file=sys.stderr)
            failures.append(path.name)
            continue
        print(f"    -> {len(rows)} rows", file=sys.stderr)
        all_rows.extend(rows)

    if all_rows:
        write_csv(all_rows, out_path)
        print(f"Wrote {len(all_rows)} rows from {len(inputs) - len(failures)} image(s) to {out_path}", file=sys.stderr)
    else:
        print("No rows extracted.", file=sys.stderr)

    if failures:
        print(f"Failed on {len(failures)} image(s): {', '.join(failures)} — re-run to retry those.", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
