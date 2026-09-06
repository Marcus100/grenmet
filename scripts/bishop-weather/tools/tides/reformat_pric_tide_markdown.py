"""Reformat generated PRIC Markdown tables for Obsidian review."""

import csv
from pathlib import Path


TABLE_HEADER = (
    "| Date (AST) | Time (AST) | Event | Provisional UHSLC MLLW (m) |"
)
TABLE_SEPARATOR = "|---|---:|---|---:|"


def reformat(path: Path) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    lines = [
        line.replace(
            "Heights in the\n",
            "The MLLW\n",
        ).replace(
            "station-datum and MLLW columns use a provisional observational crosswalk to",
            "column uses a provisional observational crosswalk to",
        )
        for line in lines
    ]
    header_index = next(
        (i for i, line in enumerate(lines) if line.startswith("## August 2026")),
        next(i for i, line in enumerate(lines) if line.startswith("| Date (AST)")),
    )
    rows: list[tuple[str, str, str, str, str, str]] = []
    csv_path = path.with_suffix(".csv")
    with csv_path.open(newline="", encoding="utf-8") as stream:
        for record in csv.DictReader(stream):
            rows.append(
                (
                    record["date_ast"],
                    record["time_ast"].removesuffix(" AST").split(" ")[-1],
                    record["event_type"].title(),
                    f"{float(record['height_m_relative_uhslc_mllw_provisional_crosswalk']):.2f}",
                )
            )

    output = [
        line for line in lines[:header_index]
        if line not in {"## August 2026", "## September 2026"}
    ]
    for month, title in (("08", "August 2026"), ("09", "September 2026")):
        if output and output[-1] != "":
            output.append("")
        output.extend([f"## {title}", "", TABLE_HEADER, TABLE_SEPARATOR])
        for row in rows:
            if row[0][5:7] == month:
                output.append("| " + " | ".join(row) + " |")
    path.write_text("\n".join(output) + "\n", encoding="utf-8")


def extract_september_only(path: Path) -> None:
    lines = path.read_text(encoding="utf-8").splitlines()
    august_index = next(i for i, line in enumerate(lines) if line == "## August 2026")
    output = lines[:august_index]
    output = [
        line.replace("Period: 2026-08-01 through 2026-09-30", "Period: 2026-09-01 through 2026-09-30")
        for line in output
    ]
    grouped: dict[str, list[str]] = {}
    csv_path = path.with_suffix(".csv")
    with csv_path.open(newline="", encoding="utf-8") as stream:
        for record in csv.DictReader(stream):
            if record["date_ast"][5:7] != "09":
                continue
            grouped.setdefault(record["date_ast"], []).append(
                f"{record['event_type'].title()} — "
                f"{record['time_ast'].removesuffix(' AST').split(' ')[-1]} — "
                f"{float(record['height_m_relative_uhslc_mllw_provisional_crosswalk']):.2f} m"
            )
    output.extend(
        [
            "## September 2026 — AST",
            "",
            "| Date | Tide 1 | Tide 2 | Tide 3 | Tide 4 |",
            "|---:|---|---|---|---|",
        ]
    )
    for day in range(1, 31):
        values = grouped.get(f"2026-09-{day:02d}", [])[:4]
        values.extend(["—"] * (4 - len(values)))
        output.append(f"| {day} | " + " | ".join(values) + " |")
    target = path.with_name("pric-tides-2026-09-01-to-2026-09-30.md")
    target.write_text("\n".join(output) + "\n", encoding="utf-8")


if __name__ == "__main__":
    for directory in (
        "2026-august-september-v1.1-pric-primary",
        "2026-august-september-v1.2-pric-primary",
    ):
        reformat(
            Path("exports/02-atmosphere-aviation/meteorology-and-climate/tides/pric")
            / directory
            / "pric-tides-2026-08-01-to-2026-09-30.md"
        )
    extract_september_only(
        Path("exports/02-atmosphere-aviation/meteorology-and-climate/tides/pric/2026-august-september-v1.2-pric-primary")
        / "pric-tides-2026-08-01-to-2026-09-30.md"
    )
