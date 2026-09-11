# Layout and spacing

## Start with too much white space, then remove

White space on the web is almost always *added* — you nudge margin up until something stops looking actively bad, which lands you on the minimum rather than the right amount. Invert it: give an element far too much room, then take space away until you are happy. What feels slightly excessive in isolation reads as just right in a full interface.

Dense layouts are legitimate — `gaa-admin` is deliberately one — but density must be a decision, not the default. It is far easier to notice you need to remove space than to notice you need to add it.

## The scale is non-linear on purpose

"Everything is a multiple of 4px" does not help you choose between 120px and 125px. A useful scale accounts for *relative* difference: 12→16px is a 33% jump, while 500→520px is 4%. **No two adjacent values should be closer than about 25%**, so steps stay tight at the small end and open up as they grow.

Tailwind's scale already has this shape, and this repo deliberately does not shadow it with a token — defining `--spacing-<n>` would silently resize every `p-4` in the monorepo. Pick from `p-2 / p-3 / p-4 / p-6 / p-8 / p-12 / p-16`, do not reach for `p-[18px]`.

To choose a value: guess, then compare against the step on either side. Usually two of the three are obviously wrong. If an outer option wins, re-centre on it and compare again.

## You do not have to fill the screen

If a thing needs 600px, give it 600px. Spreading content out to consume available width makes it harder to read, and extra space at the edges never hurt anything. This applies per-section too — nothing has to be full-width just because the nav is.

- **Shrink the canvas.** Small interfaces are easier to design under real constraints. Start around 400px and design mobile first; moving up to a wide screen usually changes less than you expect.
- **Think in columns.** When something works best narrow but looks unbalanced in a wide shell, split it — pull supporting text into a second column rather than stretching the form.
- **Do not force it the other way either.** If you genuinely need the space, take it.

## Grids are overrated

A grid is just a constrained set of percentage widths, and plenty of elements should not be fluid at all.

- A sidebar should have a **fixed width sized for its contents**, with the main area flexing to fill what is left. Give it 25% and it grows uselessly wide on large screens and truncates awkwardly on small ones.
- Do not use percentages inside a component unless you actually want that part to scale.
- **Do not shrink an element until you have to.** If 500px is the right width for a login card, give it `max-w-[500px]`-equivalent behaviour and let it shrink only when the viewport is narrower than that — not step down through column counts, which can leave a card *wider* at medium sizes than at large ones.

## Relative sizing does not scale

Encoding "headline = 2.5 × body" in `em` breaks as soon as the body size changes: 2.5em against 14px mobile body copy is 35px, far too large — the right mobile headline is 20–24px, a completely different ratio. There is no stable relationship to encode.

**Large things must shrink faster than small things.** The gap between small and large elements should be less extreme on small screens.

The same holds inside a component. Defining button padding in `em` makes every size a proportional zoom. You want the large button to feel *generous* and the small button *disproportionately tight* — so set padding independently at each size.

## Ambiguous spacing

When there is no border or background separating groups, spacing is the only thing communicating which elements belong together.

> **Always leave more space around a group than within it.**

Violations to watch for:

- A stacked label and input where the margin below the label equals the margin below the input — the label no longer visibly belongs to its field, and users put data in the wrong box.
- Section headings with as much space below them as above.
- Bulleted lists where the gap between items matches the line-height inside an item.
- Horizontally laid-out components — the same mistake happens on the x-axis.
