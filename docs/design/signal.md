---
version: alpha
name: Grenada Signal
description: Editorial reader for Grenadians everywhere — serif headlines, ink on white, island green and gold.
colors:
  primary: "#1a7a3d"
  green-dark: "#136030"
  gold: "#f5c518"
  ink: "#0a0a0a"
  alert: "#c8102e"
  muted: "#6b7280"
  rule: "#e5e7eb"
  paper: "#ffffff"
  secondary: "#f3f4f6"
typography:
  lead-headline:
    fontFamily: Source Serif 4
    fontSize: 36px
    fontWeight: 700
    lineHeight: 1.25
    letterSpacing: -0.025em
  section-title:
    fontFamily: Source Serif 4
    fontSize: 24px
    fontWeight: 700
    lineHeight: 28px
    letterSpacing: -0.025em
  story-title:
    fontFamily: Source Serif 4
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.375
  body:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.75
  small:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 20px
  eyebrow:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 600
    lineHeight: 16px
    letterSpacing: 0.05em
  meta:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: 400
    lineHeight: 16px
    letterSpacing: 0.025em
rounded:
  md: 6px
  lg: 8px
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  section-y: 32px
  band-y: 40px
  story-y: 16px
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
  button-primary-hover:
    backgroundColor: "{colors.green-dark}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
  button-on-green:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
  briefing-panel:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.paper}"
  eyebrow:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.primary}"
  eyebrow-underline:
    backgroundColor: "{colors.gold}"
  highlight:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink}"
  story:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
  meta:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.muted}"
  divider:
    backgroundColor: "{colors.rule}"
  footer:
    backgroundColor: "{colors.secondary}"
    textColor: "{colors.ink}"
  alert-banner:
    backgroundColor: "{colors.alert}"
    textColor: "{colors.paper}"
    rounded: "{rounded.md}"
---

# Grenada Signal — DESIGN.md

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-03

Agent-readable spec for `apps/web/signal`, the mobile-first civic news reader for
Grenada Signal. [DESIGN.md format](https://github.com/google-labs-code/design.md);
restates `apps/web/signal/src/app/globals.css` and adds **no** tokens. Signal is its
own brand — never use `gm-*` or `gaa-*` here.

Other lanes: [gms](./gms.md) · [gaa-admin](./gaa-admin.md) · [mbia](./mbia.md).

## Overview

A Grenada-rooted general-interest news and entertainment destination for local,
diaspora, Caribbean and international readers. The owner prioritises broad reach
and repeat visits: a concise dated briefing followed by reporting, curated coverage,
entertainment, culture, sport, lifestyle, guides and opportunities. The reader
uses Semafor-inspired editorial hierarchy and Morning Brew’s approachable voice.
The owner requested **frontend design first, CMS last**. Current homepage content is sixteen source-attributed editorial previews checked
on 3 October 2026, awaiting human review and excluded from indexing. June samples
remain labelled in the archive and at their original URLs.

## Typography and colour

Keep the existing Signal tokens in `src/app/globals.css`: green for identity and
links, gold for rules, ink on white for reading. No new tokens or GMS branding.
Gold is never small text. Muted text is used only on white backgrounds.

Source Serif 4 carries headlines; Inter carries body text, navigation and metadata.
The masthead scales from `text-4xl` to `text-7xl`. Lead headlines use `text-3xl`
to `text-4xl`; story headlines `text-2xl`. Article prose and summaries are 18px
(`prose-lg`, `text-lg`); metadata is 14px (`text-sm`). Use rem-based utilities.
Body links are underlined. Dates are absolute and rendered in UTC for consistency.

## Layout and reading sequence

- Masthead: place names, substantial centred wordmark, short proposition, wrapping
  navigation . It is not sticky.
- Homepage: latest dated Daily Signal → lead and supporting stories → selected
  seasonal reading collection → populated topics → archive invitation.
- Desktop uses a `max-w-7xl` container and rule-separated columns. Phones use one
  column, with `px-4` gutters; desktop gutters use `sm:px-8`.
- Article and edition bodies retain a comfortable `max-w-2xl` measure. No shadows,
  gradients or decorative image placeholders. Text-only stories stand on their own.
- No disabled signup promotions, dummy social links, or empty media promotions.
  Discovery and archive links provide the next reading action.

### Editorial supply

The owner will combine aggregation and original reporting. Every story published
on Signal has a human author; AI is used internally for editorial assistance, not
as an author or a separate public content category. Preserve attribution to
underlying sources. Grenada leads the homepage, with selected Caribbean and
international news, entertainment and sport alongside it. Use warm, clear English,
with local character and no forced slang. Choose wider stories for significance,
usefulness or enjoyment; a Grenadian connection is welcome but not compulsory.
No fixed geographic quota or fabricated trending rankings. Do not invent reporting
or publish an unsourced batch.

### Selected story section

The owner’s Morning Brew screenshot supersedes the earlier Option A treatment.
At desktop widths, a bordered, lightly tinted feature card with large photography
sits beside “The Latest”: a compact list of four selected story headlines with
uppercase green topic labels, sans-serif headlines, fine horizontal dividers. Only the feature shows a summary and image here;
article pages retain full imagery and source credits. The feature headline stays
serif. An All stories link opens the archive. The two columns start at the same
height and become a single sequence below the desktop breakpoint. More from
Signal remains four equal series columns below the feature/list.

## Coverage and discovery

Seven topics: News & Community, Money & Opportunity, Culture & Entertainment, Sport,
Weather & Environment, Fact Check, and Caribbean & World. Existing section URLs
`weather-ready`, `opportunity` and `check-d-ting` remain stable, including `culture-life` and `grenada-world`. Main navigation
exposes News, Entertainment, Sport, Money and Caribbean & World. Only populated
story sections appear on the homepage; topic pages honestly explain missing coverage.

Daily Signal, Parish Pulse and Check D Ting remain the editorial series.
`/topics` shows all coverage areas; the homepage shows only populated sections.
`/briefs`, `/learn`, `/archive`, `/search` and `/collections/[slug]` make the
existing samples discoverable. Search filters titles, summaries and topic labels
on the device; the query is neither sent to a server nor added to a URL.

## Components and states

- `SiteHeader` / `SiteFooter`: wrapping navigation and working reading links.
- `StoryCard`: optional lead hierarchy, headline, summary, public byline and date.
- `PageIntro`: one page title, a short introduction and a gold rule.
- `DemoNote`: explains that sample claims, forecasts and deadlines are unverified.
- `EmptyState`: states that no stories exist and links to all topics.
- `SearchReader`: visible label, initial guidance, live result count and no-results help.
- `ArchiveInvitation`: a next reading action without collecting contact details.

Missing stories return a designed 404. Unexpected route failures keep the site
shell, report to Sentry and offer retry. Missing images produce no empty boxes.
The current content pipeline is local; CMS availability states belong to the later
integration phase and must never substitute demo content for a failed feed.

## Accessibility and verification

Keep the skip link first, one h1 per page, meaningful section labels, visible
keyboard focus and wrapping navigation. Main actions are at least 44px tall.
Verify 320px and desktop widths, 200% text enlargement, original article and edition
URLs, empty topics, no-image stories, local search and sample notices. Site-wide
`noindex, nofollow` remains until actual publication is authorised.

### Image provenance

`StoryImage` uses local optimised photographs, descriptive alt text, archive context
and linked credits. Demo selections live in `src/lib/story-images.ts`; provenance
is in `public/images/CREDITS.md`. No image selection means no frame.

Desktop refinements: More from Signal is a heading above four equal series columns.
The seasonal collection introduction spans the section above two story cards,
with its reading link beside the introduction where space permits.

## October content selection

The owner authorised adding the researched stories across all seven topics. Homepage lead order:
Parliament dissolution, the 1261 film festival, then Chevening. The 3 October
Daily Signal links to the sourced summaries. “October in Grenada” selects
SoundLeap, conservation and film; its first two stories appear on the homepage.
Legacy weather collection URLs remain available. No human byline is invented:
source credits identify original reporting, while editorial-preview notices
state that Signal human review is pending. Keep noindex until publication review.

Homepage topic cards exclude the five feature/latest selections and the two collection cards. Each topic has a distinct lead; further stories use compact headlines. October previews cover all seven topics, with explicitly dated scam-awareness coverage rather than manufactured rumours.

Desktop review includes 1280px and 1440px. Caribbean & World spans the topic grid with up to three story columns, avoiding an orphaned final column; topic photography uses the shorter 2:1 crop.

The owner rejected expandable editorial-context panels on discovery cards. Keep cards focused on image, headline, summary; keep source/date metadata and further context inside the article. Regional coverage grows within the existing topic section. Illustrative book/camera archive photos also illustrate grants and the creative-workshop recap.

Owner refinement: omit story source/date lines from discovery cards and Latest. Keep photo credits as 12px (`text-xs`) captions with relaxed line-height and linked attribution; full story provenance remains on article pages.

The Latest stays text-only per the owner’s final clarification. Keep photography on the lead and other discovery sections.

Remove the header editorial-preview banner per owner request; article-level review notices and noindex remain. More from Signal includes Daily Signal, Parish Pulse, Check D Ting and Opportunities.

The closing archive invitation is a full Keep reading section: an introduction and archive link alongside three pathways to past editions, guides and topics. It uses the existing secondary background and gold rule.
