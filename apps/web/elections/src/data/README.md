# Elections Grenada data

Historical and other slow-changing records stay in JSON. Edit the smallest
relevant source record, then regenerate the derived files. No database or
network access is needed to rebuild this archive.

## Where to edit

Paths below are relative to `src/data/source/`.

| Path | Owns |
| --- | --- |
| `reference/events.json` | Event IDs, ISO dates, map and division coverage |
| `reference/constituencies.json` | Modern constituency codes and names |
| `elections/<year>/results.json` | Candidate votes, constituency totals, sources and verification flags for one election |
| `elections/<year>/national.json` | Separately reported national registration and turnout figures |
| `elections/<year>/stations/<code>.json` | Original polling-station returns for one constituency |
| `referendums/<year>/summary.json` | National certificates, bills, police totals and coverage caveats |
| `referendums/<year>/stations/<code>.json` | Readable referendum station returns |
| `geography/base.json` | Island outlines and inset positioning |
| `geography/constituencies/<code>.json` | One constituency's illustrative shape |
| `geography/divisions/<code>.json` | That constituency's division shapes, labels and villages |
| `register/snapshots/<date>.json` | Counts from one consolidated register |
| `register/addenda/<date>.json` | Counts from one quarterly addendum |
| `register/metadata.json` | Register methodology and occupation counts |
| `verification/discrepancies/<id>.json` | One documented conflict, gap or resolution |
| `verification/` other records | Correction history and independently transcribed reference figures used for checks |
| `campaign.json` | Active campaign data; separate from the historical build |

Keep early elections under their historical constituency names. Modern letter
codes and geometry must not be applied to elections before 1972. Map shapes
are illustrative, not official boundary records.

Published constituency totals and polling-station returns are separate evidence.
Do not replace an independently published total with a calculated sum: gaps and
source disagreements must remain inspectable. The same applies to Gazette,
newsletter and certificate figures used to check other records. These are
intentional independent references, not alternative copies to update in tandem.

Register tuples are **[electors, female, male]**. They contain counts, never
individual electors. Candidate and station tuple layouts are described in
`types.ts`; uncertainty markers and source notes belong beside the affected record.

## Editing and verification

From `apps/web/elections`:

```sh
# Edit source JSON, preserving its provenance and uncertainty flags.
pnpm exec biome check --write src/data/source
pnpm data:build
pnpm data:check
pnpm test
```

`data:build` requires Python 3 (standard library only) and the installed pnpm
workspace. It assembles static TypeScript imports, calculates trend measures,
reruns the archive's source checks, and regenerates the five CSV downloads.
Review those diffs along with the source change. New election metadata belongs
in `reference/events.json`; adding a new kind of record or referendum also needs
its adapter, validation and tests updated.

`data:check` runs using Node alone, including during production builds. It rejects
changed, added or missing source files and stale generated outputs until a rebuild
records them. This checks reproducibility, not the truth of a newly entered figure.
Source verification is still required. It deliberately excludes campaign edits.

`history.test.ts` contains compact fingerprints of the pre-refactor archive.
They prove the split preserved every value, including fields not currently shown
on a page. Update a fingerprint only after reviewing an intentional data correction.

## Separation of concerns

- **Source records:** `source/` contains authoritative JSON and independent evidence.
- **Assembly and export:** `scripts/history/` is Python build tooling. `archive.py`
  assembles records; `measures.py`, `elections.py`, `stations.py`, `features.py`
  and `validation.py` calculate and verify outputs; `build.py` coordinates them.
- **Derived files:** `derived/` contains generated import modules, trend statistics,
  validation reports and a fingerprint manifest. The import modules reference
  source files rather than copying their data. Never edit these outputs by hand.
- **Downloads:** `public/data/master_*.csv` are generated delivery formats, not
  editable sources. Keep them checked in so deployment needs no Python runtime.
- **Server interface:** application pages read through `load.ts`. Tests may import
  assembled records directly; small reference catalogues can be used by shared
  model code. Client components receive only the data their interface needs.
- **Presentation and analysis:** the existing model modules calculate views from
  those records; components do not know the source directory layout.

The source records were split losslessly from the original checked Elections
Grenada snapshot on 2 October 2026. Export and verification logic was brought into
this repository from that snapshot's prototype pipeline. Rebuilding no longer
requires anything under `temp-files/`.

## Educational evidence

`evidence.ts` classifies sources and evaluates complete inputs per measure;
`learning.ts` contains the eight guide definitions. Official winner declarations
do not make every vote or turnout figure official (notably 1990). The static
`/evidence.json` endpoint accompanies the original CSVs without changing totals.
National comparison tables retain full history by default and withhold unsupported
measures in their official-data-only view. No partial-vote re-normalisation is used.

Site-wide `/site-search.json` indexes learning guides, people, parties, elections,
constituencies and tools at build time. `/search-index.json` remains the separate
constituency lookup contract. Neither index contains individual voter records.
