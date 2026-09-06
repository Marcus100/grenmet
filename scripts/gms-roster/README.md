# Roster ingestion

Converts a monthly duty-roster PDF into the versioned JSON interchange file that
the hosted HR system ingests.

**PDFs never reach the server.** Conversion is a local, human-run step: convert,
read the validation report, then upload the JSON. This keeps PDF parsing (and its
CPU cost and layout fragility) out of the API image, so a template change is a
desk annoyance rather than a production incident.

## Run

```bash
uv run --no-project scripts/gms-roster/pdf_to_json.py \
    "temp-files/gms-roster/September 2026.pdf" -o out/2026-09.json
```

`--no-project` keeps this off the monorepo Python workspace. `pdfplumber` is
declared as PEP 723 inline script metadata, so it never enters `pyproject.toml`,
the lockfile, or the API image.

Exit codes: `0` clean, `1` usage/IO error, `2` validation blocked.

## Department profiles

The converter carries no knowledge of any particular department. Everything
department-specific lives in `profiles/<code>.json`: the shift-code legend, the
grade bands, and the roster-name to account map. A second department ships a
second profile; nothing in the script changes.

The legend must match `hr.shift_catalog` — `roster_assignment.shift_code` is a
foreign key to it.

### Why a name map rather than initial matching

A person's roster initial is not necessarily their official one. Two GMS staff
are written under a different given name every month:

| Roster prints | Personnel record | Account |
|---|---|---|
| `J. Charles` | Jude Andre Charles | `acharles` |
| `K. Bedeau` | Kenrick Dieonne Bedeau | `dbedeau` |

Matching on first-initial + surname silently fails on both, and would pick the
wrong person entirely if two staff ever shared an initial and surname.

## Validation

Blocking checks refuse the conversion; a warning is recorded and passed through.

| Check | Severity | Catches |
|---|---|---|
| `column_count` | warn | Day columns disagreeing with the real month length |
| `overflow_codes` | **block** | Shift codes past the last day of the month |
| `missing_columns` | **block** | A template shorter than the month (silent truncation) |
| `weekday_alignment` | **block** | Printed weekday letters disagreeing with the calendar |
| `known_codes` | **block** | Codes absent from the profile legend |
| `name_resolution` | **block** | Roster names with no mapped account |
| `unique_rows` | **block** | A person appearing twice |
| `cadet_agreement` | warn | The `*` marker disagreeing with the profile grade |

`--allow-overflow` downgrades `overflow_codes` and records
`source.overflow_discarded: true` in the output, so discarding stays auditable.

### The blank template has 31 day columns

It is not trimmed per month, so a 30-day month carries a 31st column of real
codes. In September 2026 that column is October 1st: every person with a cleanly
detectable rotation continues it there. Those codes belong to the next month's
roster, not this one.

Column position is taken from x-coordinates, never text order — rows may start
mid-month (someone joining partway through), and text-order parsing shifts such a
row's entire month without any error.
