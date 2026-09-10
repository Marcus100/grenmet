# Documentation Consistency & Authority Audit — September 2026

**Status:** Findings only — no document was edited
**Recorded:** 2026-09-10
**Owner:** Barrels Grenada
**Repository state:** branch `dev` at `055bdce3`

**Scope:** all 82 Markdown files under `docs/`, the 12 `CLAUDE.md` / `AGENTS.md`
agent-instruction files, and root `README.md`, `CONTRIBUTING.md`, `VENDORED.md`.

**Method:** four passes — (1) mechanical checks of paths, commands, ports and
headers; (2) verification of load-bearing claims against the code they describe;
(3) document-versus-document contradiction search; (4) agent-instruction review.
Findings are locate → verify → recommended fix, following
[the June 2026 audit](./audit-2026-06.md).

**Threshold:** everything, including style. Style findings are aggregated rather
than listed per file so that substance stays readable.

## Severity rubric

- **Critical** — an instruction that would cause data loss, a security mistake,
  or a production incident if followed
- **High** — an instruction that will fail if followed, or that misroutes a
  reader or an agent to the wrong place
- **Medium** — two authoritative documents disagree, or a claim is stale enough
  to mislead
- **Low** — missing metadata, structural inconsistency, cosmetic drift

## Findings

| # | Sev | Finding | Location | Fix |
| --- | --- | --- | --- | --- |
| 1 | **High** | Post-consolidation instructions never updated. Tells the reader to `cd apps/web/wxwatch` / `apps/web/wxproducts` — directories deleted in the June 2026 consolidation into `gaa-admin`. Compounded by two wrong script names: `pnpm db:generate` and `pnpm db:migrate` do not exist; the real ones are `db:wxwatch:generate` / `db:wxproducts:migrate` and siblings. Also cites `src/db/seed.ts`, which exists in neither `src/db/wxwatch/` nor `src/db/wxproducts/`. Troubleshooting is where someone lands when already stuck, so wrong instructions cost the most here. | `docs/troubleshooting.md:135`, `:146`, `:158` | Repoint to `apps/web/gaa-admin`, correct both script names, and either restore or drop the seed reference |
| 2 | **High** | The Where-to-Look table routes "Service architecture" to `docs/architecture.md`, but that file's own first line states it is **not** a codebase architecture guide — it is GMS service strategy, and it redirects to `technical-overview.md`. An agent following the table lands on strategy when it wanted the monorepo's structure. This is in the file that is machine-read first, so it misroutes every session. | `CLAUDE.md:145` | Route "Service architecture" to `docs/technical-overview.md`; give `docs/architecture.md` a row naming it GMS service strategy |
| 3 | **Medium** | Events-versus-Pay anchor contradiction. Portfolio policy #1 states Events and Tickets is the first transactional product and takes default discretionary capacity; Pay/Invoice appears nowhere in the portfolio register, while payment providers (Stripe, Republic ePay) are in active testing and a working position elsewhere treats Pay/Invoice as the anchor. | `docs/portfolio/barrels-portfolio-implementation-plan.md:24` vs current work | Record payments as a platform capability pulled by Events under policy #4; keep Pay/Invoice as a product in *Explore* until a settlement loop is proven |
| 4 | **Medium** | `figma.config.json` is described as "Active configuration tied to the design-system boundary". ADR-0012 removed the `@figma/code-connect` dependency and the `button.figma.tsx` mapping, and root `CLAUDE.md` instructs agents to ignore all Figma tooling. The file configures a parser for a dependency that no longer exists. | `docs/portfolio/repository-delivery-map.md:145` | Reclassify as vestigial/pending removal, or delete the config and the row together |
| 5 | **Medium** | Loyalty has no portfolio register row. It exists only as one line of *Explore* prose, while Streaming — an option at a comparable maturity — has a full register row with horizon, outcome and acceptance authority. | `docs/portfolio/barrels-portfolio-implementation-plan.md:121` | Add register rows for loyalty and for customer identity |
| 6 | Low | 59 of 69 non-ADR documents carry no status, owner or date header, including the nine highest-traffic references: `architecture.md`, `technical-overview.md`, `security.md`, `deployment.md`, `env.md`, `infrastructure.md`, `data-architecture.md`, `design-system.md`, `api/contracts.md`. A reader cannot tell what is current, who owns it, or whether it is authoritative. The 13 ADRs are exempt — they correctly use the `## Status` section from their own template. | `docs/` (59 files) | Adopt the `**Status:** / **Effective:** / **Owner:**` block already used by `docs/portfolio/` and `docs/internal/`, starting with the nine above |
| 7 | Low | Legacy `GrenMet` identity appears across ~20 documents. **Most are not doc drift:** in `deployment.md` and `infrastructure.md` they are live Docker Compose project and container names (`grenmet`, `grenmet-staging`, `grenmet-db-1`), so the docs accurately describe real infrastructure. The transition objective to retire the `GrenMet` ownership identity therefore has an infrastructure tail, not just a documentation one. | `docs/infrastructure.md:11-12,79-111`, `docs/deployment.md:321-453` | Do not edit these as prose. Track the compose-project rename as infrastructure work, and note the dependency in the transition plan |

## Verified clean

Recorded so these are not re-checked. Each was a plausible failure that did not
occur.

| Check | Result |
| --- | --- |
| Web app dev ports vs `docs/ports.md` | All 8 apps match exactly (3000–3006, 3009) |
| `pnpm` commands in `AGENTS.md` | All resolve to root `package.json` scripts |
| `db:*` script references in docs | Correctly scoped — every citation says to run from `apps/web/gaa-admin` |
| FastAPI seed/import script references | App-relative and present under `apps/api/fastapi/scripts/` |
| App-level `CLAUDE.md` script paths | App-relative and present (`convert-scrape.py`, `generate-sections.mjs`, `wxproducts-export-pdf.mjs`) |
| Figma Code Connect section in `design-system.md` | Correctly disclaimed as historical under ADR-0012 |
| `apps/api/fastapi/cap/` absence | Documented as a git-ignored read-only parity reference |
| Missing `.env.local` files | Git-ignored by design, not broken references |
| `docs/audit-2026-06.md` stale `file:line` citations | Explicitly disclaimed in its own header |

## Method note

The mechanical path check produced **34** apparently-missing paths; **6** survived
verification. The false positives came from three causes, all worth knowing before
re-running this:

1. Paths in app-level `CLAUDE.md` files are relative to the app, not the repo root.
2. Generated and git-ignored artifacts (`.env.local`, `htmlcov/`, vendored
   references) are absent by design.
3. Transition and migration plans legitimately name surfaces that do not exist
   yet (`apps/pwa`, `apps/web/dowden`, `apps/web/gdbank`, `apps/web/barrels`).

A path checker that does not account for those three reports roughly five false
findings for every true one.

## Remediation log

| # | State | Note |
| --- | --- | --- |
| 1–7 | Open | Awaiting approval; no document edited by this audit |
