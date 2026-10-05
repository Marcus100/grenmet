# Elections Grenada

Port **3007**. Package: `@barrelsgd/web-elections`. Lane spec:
`docs/design/elections.md`. Deployment: [Vercel guide](../../../docs/web/elections-deployment.md).
Elections and the separate Barrels holding page use Vercel; the operational apps retain their existing DigitalOcean release pipelines.

## Product boundary

- **Public education first:** help people master Grenada’s elections and adjacent civic topics; explain how and why, use worked examples, address misconceptions, and distinguish evidence from inference—not just present results.
- A Barrels Grenada product: coverage of Grenada's 2026 general election, and the
  history of every election and referendum since 1951. It is not a GAA or GMS
  service and makes no official claims for the Parliamentary Elections Office.
- The brand is **Elections Grenada**. Keep the "independent Barrels Grenada
  project" line in the footer so it is never mistaken for the Parliamentary
  Elections Office.
- `/` is the front page (2026 at a glance, Find your constituency, who holds
  each seat, history). `/2026` is the election coverage page. Election state (awaiting
  date → campaign → polling day → counting) comes from `src/data/election-2026.ts`.
  Set `pollingDay`/`nominationDay` there when they are announced.
- Navigation: Election 2026 · Learn · Results & history · Your constituency · People & parties, with site-wide Search (owner-approved). Light only; constituency lookup remains separate from site search.
- Learning: guided exploration for everyday adults; eight practical civic guides, sourced examples, optional anonymous self-checks, and no stored learning progress.
- Wording: **constituency** for the place (the official term);
  **seat** only for House counts ("9 of 15 seats"). Constituency pages are
  addressed by name (`/constituencies/st-mark`); PEO letters redirect.

## Data rules

- Historical data stays in small JSON records by event, constituency or register date; see [the data guide](src/data/README.md). Pages read through `src/data/load.ts`; small reference catalogues may be shared, and tests may read assembled records.
- Edit `src/data/source/`, then run `pnpm data:build` and `pnpm data:check`. Never hand-edit `src/data/derived/` or public CSV exports. Preserve independently reported totals and source discrepancies.
- Client islands receive only the slice they need. A FastAPI domain comes later, for results night.
- Evidence catalogue: `src/data/evidence.ts`; teaching content: `src/data/learning.ts`. Keep publisher authority separate from verification and label our calculations, illustrative scenarios and mixed-source statistics at the point of use.
- Every figure needs a source. Show uncertain figures, but mark them: ✱ unverified,
  ✱✱ conflicting or unclear, † corroborated by a contemporaneous report (`Flag`).
- Official-data-only comparisons require every input to be officially supported; withhold incomplete measures, never zero-fill or re-normalise partial votes. Retain full history with visible source labels by default.
- Map constituency codes to names from `source/reference/constituencies.json`, never from memory
  (J = St. George North West, G = Town of St. George).
- Coverage posts are editorial. They live in `src/data/coverage.ts` until they move to
  Payload CMS. Each post has its own page at `/updates/<slug>`, which lists its sources; the
  homepage feed shows no source lines at all (owner decision); campaign events keep theirs on `/updates`.
- Official documents we host (e.g. Gazette notices) go in `public/documents/official/`; cite them as a campaign source with that path.
- Photos: openly licensed only, in `public/images/` + `CREDITS.md` + `src/data/photos.ts`; always credited, square-edged, newspaper style (owner decision). Constituency photos only where the place is certainly in that constituency.
- Keep the next-election model's parameters visible and backtested on the page.

## UI rules

- Default to Server Components. Use the `--el-*` tokens and `@barrelsgd/ui` primitives.
  Party colours are data only: never chrome, links or brand. Grenada's flag colours appear
  only together as `FlagStripe` (owner decision). DPM is its own orange (`--el-dpm`), not GULP's.
- Design at 375px first. Below an `80rem` masthead container width the navigation is the hamburger
  (`mobile-menu.tsx`). Keep it working when adding pages, and add new pages to
  `src/lib/nav.ts`.
- Readability: 18px reading text, 16px supporting prose/controls/tables, 14px minimum short labels; never shrink source notes to establish hierarchy. Keep chart labels legible in a local scroll viewport and check 375px plus enlarged text.
- Tests: `pnpm vitest run` from this directory.
