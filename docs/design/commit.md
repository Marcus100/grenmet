---
colors:
  background: "#030712"
  foreground: "#ffffff"
  accent: "#7dd3fc"
---

# Commit

Barrels Grenada engineering blog (`commit.barrels.gd`), derived from the
Tailwind Plus "Commit" template. A fixed dark sidebar (Tailwind `gray-950`
background, white headline, `sky-300` accent, radial sky glow and a star field)
holds the intro and links; the timeline of posts scrolls beside it on desktop
and below it on mobile. Posts read in the `.typography` styles
(`src/styles/typography.css`) in light or dark mode, chosen by the toggle in
the top right. Each post shows its date on the timeline and a `v<release>`
badge. Display face Mona Sans, body Inter.

The palette is Tailwind's default `gray` and `sky` scales, restated as hex in
`src/styles/tailwind.css`; no `--gm-*` or GMS tokens, and no new tokens without
approval. The star field twinkles with CSS only and is still under
`prefers-reduced-motion`. Keep focus visible on every link. No forms, no
analytics.

Source: `apps/web/commit/src/styles/tailwind.css`.
