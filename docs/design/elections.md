---
version: alpha
name: Elections Grenada
description: Civic results atlas in newspaper form — ink on paper, hairline rules, serif for the story, sans for the numbers, colour only for data.
colors:
  paper: "#ffffff"
  paper-2: "#f4f5f6"
  ink: "#121314"
  ink-2: "#3b3f45"
  muted: "#5d636b"
  rule: "#dfe1e4"
  rule-2: "#b9bec4"
  sea: "#e8edf1"
  land: "#d5d9dd"
  focus: "#2b59c3"
  ndc: "#e0a300"
  ndc-ink: "#7f5a00"
  ndc-tint: "#f6e6b6"
  nnp: "#0b7a4b"
  nnp-ink: "#0b6a41"
  nnp-tint: "#cde5d8"
  gulp: "#e0623e"
  gulp-ink: "#a8401f"
  gulp-tint: "#f7d5c9"
  hist: "#4a6fd0"
  hist-ink: "#3556b0"
  hist-tint: "#d6def5"
  other: "#9aa0a8"
  other-ink: "#5d636b"
  other-tint: "#e3e5e8"
  yes: "#2d6cc0"
  yes-ink: "#255aa1"
  yes-tint: "#d7e3f5"
  no: "#b04a86"
  no-ink: "#943c70"
  no-tint: "#f1d9e7"
  seq-0: "#e1e8f1"
  seq-1: "#23467f"
  div-mid: "#cfd2d6"
typography:
  display:
    fontFamily: Source Serif 4
    fontSize: 48px
    fontWeight: 700
    lineHeight: 52px
    letterSpacing: -0.022em
  deck:
    fontFamily: Source Serif 4
    fontSize: 19px
    fontWeight: 400
    lineHeight: 28px
  heading:
    fontFamily: Source Serif 4
    fontSize: 26px
    fontWeight: 700
    lineHeight: 30px
  body:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: 400
    lineHeight: 26px
  figure:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: 600
    lineHeight: 24px
  label:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.07em
rounded:
  sm: 2px
  md: 6px
spacing:
  unit: 4px
  gutter: 16px
  gutter-wide: 24px
  section-y: 48px
  page-max: 1240px
components:
  masthead:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  section-rule:
    backgroundColor: "{colors.ink}"
  hairline:
    backgroundColor: "{colors.rule}"
  label:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
  segmented-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
  seat-square:
    rounded: "{rounded.sm}"
  map-stage:
    backgroundColor: "{colors.sea}"
---

# Elections Grenada — DESIGN.md

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-02

Agent-readable spec for `apps/web/elections`, Barrels' Grenada election coverage
and history site. [DESIGN.md format](https://github.com/google-labs-code/design.md);
restates `apps/web/elections/src/app/globals.css`. Elections Grenada is its own brand
(like Signal and MBIA): never use `gm-*`, `signal-*` or `gaa-*` here.

Other lanes: [gms](./gms.md) · [gaa-admin](./gaa-admin.md) · [mbia](./mbia.md) ·
[signal](./signal.md).

## Overview

A civic results atlas in newspaper form. The homepage covers the coming election;
the archive holds every result since 1951, down to the polling division from 2013.
It aims to be the authority on Grenada's elections, so **every figure carries its
source**, and uncertain figures are shown but marked.

Principles:

1. **Colour is data.** A party colour on the page always means that party. UI
   chrome, links and brand are ink on paper.
2. **Never colour alone.** Party is also given in text: legend, label, tooltip or table.
3. **Show the source.** A provenance line sits under every result. Derived, secondary
   and illustrative data is marked where it is shown, not only in a footnote.
4. **A table for every map.** Every map state has a table or list.

## Colors

Tokens are `--el-*`, with aliases `bg-el-*`, `text-el-*` and `border-el-*`. shadcn
semantics map to paper/ink. The site is light only for now. The dark palette (`.dark`) is kept as a
chosen palette, not an inversion, for when dark mode returns.

| Name | Value | Token | Role |
|---|---|---|---|
| Paper | `#ffffff` | `--el-paper` | Page, `--background`. |
| Paper 2 | `#f4f5f6` | `--el-paper-2` | Hover rows, chips, notes. |
| Ink | `#121314` | `--el-ink` | Text, section rules, selected controls, `--primary`. 18.6:1. |
| Ink 2 | `#3b3f45` | `--el-ink-2` | Deck and secondary text. 10.6:1. |
| Muted | `#5d636b` | `--el-muted` | Labels and metadata. 6.07:1 on paper, 5.56:1 on paper 2. |
| Rule / Rule 2 | `#dfe1e4` / `#b9bec4` | `--el-rule`, `--el-rule-2` | Hairlines; control borders. |
| Sea / Land | `#e8edf1` / `#d5d9dd` | `--el-sea`, `--el-land` | Map background; unselected or dimmed land. |
| Focus | `#2b59c3` | `--el-focus` | Focus ring, `--ring`. |

**Parties.** Fills only. For text, use the `-ink` step. `-tint` is the close end of
margin ramps. The order NDC, NNP, historical, GULP keeps red and green apart.

| Party | Fill | Text (`-ink`) | Fill on paper | Label on fill |
|---|---|---|---|---|
| NDC | `#e0a300` | `#7f5a00` (6.24:1) | 2.23:1, so **fill only** | Ink (8.33:1) |
| NNP | `#0b7a4b` | `#0b6a41` (6.66:1) | 5.39:1 | White (5.39:1) |
| GULP, DPM, MMWU | `#e0623e` | `#a8401f` (6.14:1) | 3.51:1 | Ink (5.30:1) |
| Historical (GNP, PA, TNP) | `#4a6fd0` | `#3556b0` | 4.69:1 | White (4.69:1) |
| Others, independents | `#9aa0a8` | `#5d636b` | 2.64:1, so **fill only** | Ink (7.06:1) |

**Referendums.** Yes `#2d6cc0` and No `#b04a86` are their own pair, so a referendum map
never reads as partisan. White labels on both (5.23:1 and 5.04:1).

**Map ramps.** Turnout is sequential from `--el-seq-0` to `--el-seq-1`. Share and swing
diverge from the NNP colour through `--el-div-mid` to the NDC colour.

## Typography

Source Serif 4 (`font-serif`) for headlines, decks and headings; Inter (`font-sans`)
for body, UI and every figure. Numbers use `tabular-nums`.

| Role | Utilities |
|---|---|
| Display (page lead) | `font-bold text-[clamp(30px,4.2vw,48px)] leading-[1.08] tracking-[-0.022em]` |
| Deck | `font-serif text-lg sm:text-[19px] text-el-ink-2` |
| Section heading | `font-bold text-2xl sm:text-[26px]` under a `border-t-2 border-el-ink` rule |
| Body | Inter 16px |
| Figure | `font-semibold text-xl tabular-nums` |
| Label / eyebrow | `font-semibold text-[11px] uppercase tracking-[0.07em] text-el-muted` |

## Layout

- The page is `mx-auto max-w-[1240px] px-4 sm:px-6`. Design at 375px first, with no sideways page scroll.
- The masthead is sticky at `h-14` with an ink bottom rule and the wordmark "Elections *Grenada*". From `lg` up it shows task-named links (Election 2026, Candidates, Forecast, Make your map, Results, Constituencies) and More ▾. Below `lg`, a **hamburger** (bars fold into an X) opens one panel under the masthead: the election status, the main pages as large serif rows, then the More pages. The header has no search box and no theme toggle; Find your constituency lives on the front page and Constituencies.
- The site is light only for now (owner decision). The `.dark` palette stays in the CSS for later.
- Homepage party cards omit the long results/candidate/timeline source paragraphs (owner decision); individual candidate sources and uncertainty notes remain on the detailed pages.
- The `/2026` “Who is standing” section has no introductory source paragraph (owner decision); candidate-level uncertainty marks remain.
- Results uses a full-width atlas with the year selector above the summary and map, Previous/Next event controls, and a larger map stage. Map is the default, Seats uses equal-sized constituency tiles (labelled Constituencies for referendums), and selection zooms to polling divisions. 3D is retired. The introductory paragraph is omitted (owner decision).
- The Results timeline includes 1951–1967. Those years show historical constituency result cards and source caveats, with eight- or ten-seat totals; geographic and equal-seat maps begin in 1972.
- Make your map starts from 2022, offers historical presets from 1990, and shares encoded ratings in the URL. Historical margins set Solid at 15+ points, Likely at 5–<15, and Lean below 5.
- Sections are spaced `pt-12` and each opens with a 2px ink rule.
- Wide tables become one card per row on phones.

## Elevation & Depth

The lane is flat: rules, not shadows. The exceptions are floating map UI (tooltip,
search results, bottom sheet, nav popups), which get one soft shadow so they read
above the map.

## Shapes

Controls use `rounded-md` (6px). Seat squares and party dots use 2px. Content blocks
are square.

## Components

- **SiteHeader / DesktopNav / MobileMenu** (`src/components/`) · Masthead and navigation. `src/lib/nav.ts` feeds both.
- **ConstituencySearch** (`constituency-search.tsx`) · Find your constituency: an ARIA combobox over villages, polling places, constituencies and people, loaded from `/search-index.json` on first focus.
- **HouseMap / ClosestContests / ConstituencyCard** (`constituencies/`) · Who holds each seat, the closest 2022 contests, and one card per constituency linking to `/constituencies/[name]`.
- **HouseStrip** (`home/house-strip.tsx`) · 15 seat squares grouped by the party holding each seat now, with a majority tick after the 8th and a text legend.
- **BallotGrid** (`election/ballot-grid.tsx`) · Who is standing in each seat, as small cards rather than a wide table.
- **Flag** (`flag.tsx`) · ✱ unverified, ✱✱ conflicting, † corroborated. The reason is in the title and in screen-reader text.
- **PartyDot / SeatSquare** (`party-chip.tsx`) · Party colour, always next to a name or code.
- Ported from the prototype: Atlas (SVG Map/Seats), FlatMap (SVG), MapModeSwitch, YearScrubber, ResultsPanel (sidebar, or a bottom sheet on phones), StatusPill, ProvenanceLine, HistoryGrid, CandidateRecord.

## Motion

Motion explains a change; it doesn't decorate. Everything is instant under reduced
motion (`MotionConfig reducedMotion="user"`). The menu fades in over 150ms. Results map changes are immediate; no 3D column animation is used.

## Do's and Don'ts

- **Do** name the party in text wherever its colour appears.
- **Do** work percentages out from raw votes, and show the source line under every result.
- **Do** take constituency names from the data (`source/reference/constituencies.json`), never from memory.
- **Do** say *constituency* for the place and *seat* only for House counts.
- **Don't** use party colours for chrome, links or brand.
- **Don't** put NDC yellow or "other" grey text on paper. Use the `-ink` step.
- **Don't** map pre-1972 results onto today's 15 constituencies.
- **Do** keep results accessible through the constituency list as well as the map.
