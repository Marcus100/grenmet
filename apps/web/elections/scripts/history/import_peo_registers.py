"""Import dated public PEO PDFs as aggregate counts; never write elector records.

Requires system pdftotext. Run from the app: python3 scripts/history/import_peo_registers.py
Original PDFs and registration numbers exist only in temporary storage/memory.
"""

from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tempfile
from urllib.request import Request, urlopen

SOURCE = Path(__file__).resolve().parents[2] / "src/data/source"
DOCUMENTS = [
    ("snapshots", "2026-10-16", "16/10/2026", "consolidated-as-of-oct-16th-2026",
     "Consolidated-as-at-Oct-16th.pdf"),
    ("addenda", "2026-09-30", "01/07/2026", "constituency-addendum-september-2026",
     "Constituency-Addendum-September-2026.pdf"),
    ("addenda", "2026-10-16", "01/10/2026", "constituency-addendum-as-at-16th-october-2026",
     "Constituency-Addendum-as-at-16th-October-2026.pdf"),
]


def extract(pdf, expected_reference):
    text = subprocess.check_output(["pdftotext", "-layout", str(pdf), "-"], text=True)
    pages = [p for p in text.split("\f") if p.strip()]
    counts = defaultdict(Counter)
    sequences = defaultdict(list)
    identifiers = set()
    for number, page in enumerate(pages, 1):
        header = re.search(r"POLLING DIVISION:\s*([A-Z]\d{2})", page)
        date = re.search(r"REFERENCE DATE:\s*(\d{2}/\d{2}/\d{4})", page)
        if not header or not date or date[1] != expected_reference:
            raise ValueError(f"Unexpected header/date on page {number}")
        division = header[1]
        columns = next(line.upper() for line in page.splitlines()
                       if line.strip().upper().startswith("SEQ "))
        sex_start, sex_end = columns.index("SEX"), columns.index("ADDRESS")
        for line in page.splitlines():
            if not re.match(r"^\s*\d+\s+", line):
                continue
            row = re.match(r"^\s*(\d+)\s+.+?\s+(\d{6})\s*$", line)
            sex = line[sex_start:sex_end].strip()
            if not row or sex not in {"F", "M", "U"}:
                raise ValueError(f"Unparsed candidate row on page {number}, {division}")
            seq, identifier = row.groups()
            if identifier in identifiers:
                raise ValueError(f"Duplicate registration number on page {number}")
            identifiers.add(identifier)
            sequences[division].append(int(seq))
            counts[division][sex] += 1
    for division, sequence in sequences.items():
        if sorted(sequence) != list(range(1, len(sequence) + 1)):
            raise ValueError(f"Incomplete/repeated sequence in {division}")
    return counts, identifiers, len(pages)


def main():
    memberships = {}
    for kind, date, reference, slug, filename in DOCUMENTS:
        url = f"https://peogrenada.org/wp-content/uploads/2026/10/{filename}"
        with tempfile.TemporaryDirectory(prefix="peo-register-") as folder:
            path = Path(folder) / "source.pdf"
            request = Request(url, headers={"User-Agent": "Elections Grenada source verification"})
            with urlopen(request, timeout=90) as response:
                content = response.read()
            if not content.startswith(b"%PDF"):
                raise ValueError("Expected a PDF from the official source")
            path.write_bytes(content)
            counts, identifiers, pages = extract(path, reference)
        memberships[f"{kind}/{date}"] = identifiers
        sexes = sum(counts.values(), Counter())
        record = {
            "date": date,
            "file": filename,
            "url": f"https://peogrenada.org/document/{slug}/",
            "pdfUrl": url,
            "referenceDate": "-".join(reversed(reference.split("/"))),
            "scope": "NON-POLICE",
            "sha256": hashlib.sha256(content).hexdigest(),
            "audit": {"pages": pages, "records": len(identifiers),
                      "divisions": len(counts), "uniqueRegistrationNumbers": len(identifiers),
                      "sequenceErrors": 0, "sexCodes": dict(sorted(sexes.items()))},
            "div": {
                division: ([sum(value.values()), value["F"], value["M"]]
                           if kind == "snapshots" else sum(value.values()))
                for division, value in sorted(counts.items())
            },
        }
        target = SOURCE / f"register/{kind}/{date}.json"
        target.write_text(json.dumps(record, indent=2) + "\n")
        print(f"{kind}/{date}: {len(identifiers)} records; {pages} pages; {len(counts)} divisions")
    consolidated = memberships["snapshots/2026-10-16"]
    september = memberships["addenda/2026-09-30"]
    october = memberships["addenda/2026-10-16"]
    print(json.dumps({"september_also_in_consolidated": len(september & consolidated),
                      "october_also_in_consolidated": len(october & consolidated),
                      "addendum_overlap": len(september & october)}))


if __name__ == "__main__":
    main()
