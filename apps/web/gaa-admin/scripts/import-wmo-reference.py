"""Build the pinned, display-only GMS reference subset using Python's CSV parser.

Run from the repository root; source folders are not required at app runtime.
"""

import argparse
import csv
import hashlib
import json
from pathlib import Path
import re

FIELDS = set("""
001001 001002 001015 001063 002001 004001 004002 004003 004004 004005
005001 006001 007030 007031 007032 008016 008017 010004 010051 010063
011001 011002 011041 012101 012103 013003 013011 020001 020003 020009
020010 020011 020012 020013
""".split())
SEQUENCES = {"307011", "307018", "307020", "307021", "307080"}


def build(bufr: Path, cct: Path) -> dict:
    sources = {}

    def read(root, name):
        raw = (root / name).read_bytes()
        sources[f"{root.name}/{name}"] = hashlib.sha256(raw).hexdigest()
        return raw.decode("utf-8-sig")

    def rows(root, name):
        return list(csv.DictReader(read(root, name).splitlines(keepends=True)))

    versions = rows(cct, "C00.csv")
    if not any(r["BUFR version number"] == "46" and r["Effective date"] == "1 June 2026" for r in versions):
        raise ValueError("Expected BUFR version 46 effective 1 June 2026")

    note_maps = {
        kind: {r["noteID"]: r["note"] for r in rows(bufr, f"notes/BUFRCREX_{kind}_notes.csv")}
        for kind in ("TableB", "CodeFlag")
    }

    def notes(row, kind):
        return [row["Note_en"]] * bool(row["Note_en"]) + [
            note_maps[kind][key] for key in re.findall(r"\d+", row["noteIDs"])
        ]

    fields = []
    for group in sorted({f[1:3] for f in FIELDS}):
        code_file = f"BUFRCREX_CodeFlag_en_{group}.csv"
        codes = rows(bufr, code_file) if (bufr / code_file).exists() else []
        for row in rows(bufr, f"BUFRCREX_TableB_en_{group}.csv"):
            if row["FXY"] not in FIELDS:
                continue
            fields.append({
                "id": row["FXY"], "name": row["ElementName_en"],
                "unit": row["BUFR_Unit"], "scale": int(row["BUFR_Scale"]),
                "reference": int(row["BUFR_ReferenceValue"]),
                "bits": int(row["BUFR_DataWidth_Bits"]), "status": row["Status"],
                "notes": notes(row, "TableB"),
                "codes": [{
                    "code": c["CodeFigure"],
                    "meaning": " · ".join(filter(None, [c["EntryName_en"], c["EntryName_sub1_en"], c["EntryName_sub2_en"]])),
                    "status": c["Status"], "notes": notes(c, "CodeFlag"),
                } for c in codes if c["FXY"] == row["FXY"]],
            })
    if {f["id"] for f in fields} != FIELDS:
        raise ValueError("Missing selected descriptors")

    sequence_rows = rows(bufr, "BUFR_TableD_en_07.csv")
    sequences = []
    for code in sorted(SEQUENCES):
        members = [r for r in sequence_rows if r["FXY1"] == code]
        if not members:
            raise ValueError(f"Missing sequence {code}")
        sequences.append({"id": code, "name": members[0]["Title_en"].strip("()"),
                          "members": [{"position": position, "id": r["FXY2"], "name": r["ElementName_en"],
                                       "description": r["ElementDescription_en"]} for position, r in enumerate(members, start=1)]})
    categories = [{"category": r["CodeFigure_DataCategories"],
                   "subcategory": r["CodeFigure_InternationalDataSubcategories"],
                   "name": r["Name_InternationalDataSubcategories_en"]}
                  for r in rows(cct, "C13.csv")
                  if r["CodeFigure_DataCategories"] == "0" and r["CodeFigure_InternationalDataSubcategories"] in {"0", "1", "2", "10", "11"}]
    licenses = {root.name: read(root, "LICENSE.md") for root in (bufr, cct)}
    return {"edition": 4, "version": 46, "effectiveDate": "2026-06-01",
            "sources": sources, "licenses": licenses, "fields": fields,
            "sequences": sequences, "categories": categories}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--bufr", type=Path, default=Path("temp-files/v46/BUFR4-46"))
    parser.add_argument("--cct", type=Path, default=Path("temp-files/v2026-06-01/CCT-2026-06-01"))
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    output = Path(__file__).resolve().parents[1] / "src/data/wxproducts/wmo-reference.json"
    data = build(args.bufr, args.cct)
    if args.check:
        if json.loads(output.read_text()) != data:
            raise SystemExit("WMO reference is out of date; regenerate it")
        print("WMO reference matches source tables")
    else:
        output.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        print(f"Wrote {len(data['fields'])} descriptors and {len(data['sequences'])} sequences")


if __name__ == "__main__":
    main()
