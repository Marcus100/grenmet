# Elections Grenada

Port **3007**. Package: `@barrelsgd/web-elections`. Lane spec:
`docs/design/elections.md`.

## Product boundary

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
- Navigation uses task words (Election 2026, Candidates, Forecast, Make your map, Results, Constituencies, More ▾). No search box or theme toggle in
  the header (owner decision); the site is light only. Find your constituency is
  on the front page and `/constituencies`.
- Wording: **constituency** for the place (the official term);
  **seat** only for House counts ("9 of 15 seats"). Constituency pages are
  addressed by name (`/constituencies/st-mark`); PEO letters redirect.

## Data rules

- Data is a checked static snapshot in `src/data/source/` from the Elections Grenada
  pipeline. Import it only through `src/data/load.ts` (`server-only`). Client
  islands get only the slice they need. A FastAPI domain comes later, for results night.
- Every figure needs a source. Show uncertain figures, but mark them: ✱ unverified,
  ✱✱ conflicting or unclear, † corroborated by a contemporaneous report (`Flag`).
- Map constituency codes to names from `results.json` `cons`, never from memory
  (J = St. George North West, G = Town of St. George).
- Coverage posts are editorial. They live in `src/data/coverage.ts` until they move to
  Payload CMS. Every post lists its sources.
- Keep the next-election model's parameters visible and backtested on the page.

## UI rules

- Default to Server Components. Use the `--el-*` tokens and `@barrelsgd/ui` primitives.
  Party colours are data only: never chrome, links or brand.
- Design at 375px first. Below `lg` the navigation is the hamburger
  (`mobile-menu.tsx`). Keep it working when adding pages, and add new pages to
  `src/lib/nav.ts`.
- Tests: `pnpm vitest run` from this directory.
