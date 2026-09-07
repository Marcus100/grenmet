# Typography

## The type scale

Without a system, interfaces end up using every pixel value between 10 and 24 somewhere. That is inconsistent and slow to work with.

Modular scales (ratios like 1.618) produce fractional values that round unpredictably across browsers, and too few steps in the range UI work actually needs. **Hand-crafted scales win for interface design.** This repo has one — eleven steps, each with a paired line-height:

`text-micro` 10 · `text-label` 11 · `text-caption` 12 · `text-body-sm` 13 · `text-body` 14 · `text-body-base` 16 · `text-nav` 20 · `text-heading-sm` 22 · `text-heading-base` 26 · `text-heading-md` 30 · `text-heading-lg` 34

Always take the matching `leading-*` with the `text-*`; the pairs were chosen together.

**Never use `em` for font size.** `em` is relative to the current font size, so a `.875em` nested inside a `1.25em` parent computes to 17.5px — a value that is not on the scale at all. `px` or `rem` only.

## Choosing a typeface

Web UI here is Inter via `--brand-font-sans`; official PDFs, bulletins and forms use Noto Sans via `--brand-font-document` and `font-document`. Adding a font is a token change requiring approval. The book's selection heuristics, for when that decision is genuinely open:

- A neutral sans-serif is the safe default; the system font stack is a legitimate choice.
- **Skip families with fewer than five weights** — weight count correlates with care and detail.
- **Optimise for legibility:** avoid condensed faces with a short x-height for body UI. Headline faces have tighter letter-spacing and shorter lowercase letters; text faces have the reverse.
- Popularity is a reasonable proxy for quality, and inspecting sites you admire is a fast way to find faces you would not have found by filtering.

## Line length

Aim for **45–75 characters per line**. On the web that is roughly `20–35em` of width. Wider than 75 is risky territory.

When paragraphs share a container with images or wide components, still constrain the *paragraph* width even though the content area is wider. Mixed widths in one column look more polished, not less.

## Line-height is proportional — twice over

- **To line length:** the further the eye travels horizontally, the more help it needs finding the next line. Narrow columns can use 1.5; wide ones may need up to 2.
- **To font size, inversely:** small text needs generous leading, large headlines need almost none — a line-height of 1 is fine for display sizes.

## Baseline, not centre

When two different font sizes sit on one line — a large card title beside a small action list — vertically centring them looks subtly wrong, and gets more obviously wrong the closer together they are. Align them by **baseline**: it is a reference line the eye already perceives.

## Not every link needs a colour

Link styling designed to make a link pop out of a paragraph is overbearing in an interface where almost everything is a link. Emphasise most links subtly — a heavier weight or a darker colour. Truly ancillary links can carry no default treatment at all, revealing an underline or colour only on hover. They stay discoverable without competing with the real actions.

## Alignment

- **Left-align by default** — match the reading direction of the language.
- **Do not centre long-form text.** Centring works for headlines and short independent blocks; past two or three lines it hurts. If one of several centred blocks is too long, the best fix is usually to rewrite it shorter — which improves consistency too.
- **Right-align numbers in tables** so the decimals line up and values compare at a glance.
- **Hyphenate justified text.** Justification without hyphenation opens ugly word gaps. Justified text suits print-like layouts; left-aligned is always a safe alternative.

## Letter-spacing

Trust the type designer and leave it alone, with two exceptions:

- **Tighten headlines** set in a face designed for small sizes (Inter, Open Sans), to mimic a purpose-built display face. The reverse does not work — loosening a headline face will not make it usable at 12px.
- **Loosen all-caps text.** Caps lack the ascenders, descenders and x-height variation that make lowercase legible, so default spacing makes them harder to read. Every all-caps run should carry a `tracking-*` value.
