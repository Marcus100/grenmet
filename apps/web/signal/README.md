# Grenada Signal (`@barrelsgd/web-signal`)

An editorial reader for Grenadians everywhere. Port **3004**; domain
`signal.barrels.gd`. Source Serif 4 headlines, Inter reading text, restrained
green and gold. Desktop columns become a single reading sequence on phones.

## Current phase: frontend design

The owner requested the reader first and the dedicated Signal CMS last.
This version uses the existing seven MDX documents as clearly labelled design
samples. All pages are excluded from indexing. No new reporting, email
collection, CMS, credentials, database or deployment is included.

```bash
pnpm dev:web:signal                        # host only
pnpm --filter @barrelsgd/web-signal build
pnpm --filter @barrelsgd/web-signal test
```

## Reading routes

- `/`: dated briefing, lead/supporting stories, selected collection, populated topics.
- `/briefs` and `/today/<date>`: edition archive and original edition URLs.
- `/topics` and `/<section>`: all seven areas, including topics without coverage.
- `/<section>/<slug>`: original article URLs, sources and public bylines.
- `/learn`: selected sample guides and explainers.
- `/collections/<slug>`: ordered reading selections.
- `/archive`: all available editions and stories.
- `/search`: title, summary and topic matching in the browser; queries stay local.
- `/about`: intended editorial approach and preview status.

Selections are in `src/lib/discovery.ts`; coverage and series are in
`src/lib/nav.ts`. Existing MDX files retain their dates, authors and sources.
Images are optional and placeholder artwork is not displayed. Search uses only
the existing non-draft story query. The design preview has no signup form.

See [the design specification](../../../docs/design/signal.md).
The future dedicated Payload CMS will replace the live MDX source and import
these files as demo drafts. That work remains deferred until frontend review.


## October editorial previews

Sixteen attributed summaries and a 3 October 2026 briefing now drive the homepage,
current topics, guides and local search. The October collection replaces the
weather collection on the homepage; existing URLs and June fixtures remain.
`reviewStatus: editorial-preview` distinguishes researched drafts awaiting human
review from `sample` fixtures. `draft: false` only enables display in this noindex
preview; it is not editorial approval. Attribution names the original source,
not an invented author of a Signal article. Images retain their archive labels
and licences in `public/images/CREDITS.md`.
