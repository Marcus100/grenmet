# Depth

## Light comes from above

Every raised/inset effect reduces to mimicking one light source overhead. A door panel reads as raised because its top edge catches light and its bottom edge falls into shadow; a cabinet panel reads as inset because the lip above blocks light at the top while the bottom edge angles up into it.

People look slightly *down* at their screens, so for a flat-topped raised element you show the top edge and hide the bottom one.

**Raised** (a button):
1. Light the top edge — a top border or an inset shadow with a small positive vertical offset. **Hand-pick the lighter colour rather than overlaying semi-transparent white**, which sucks saturation out of the underlying colour.
2. Cast a small dark shadow below, with a slight vertical offset. Keep the blur tight — a couple of pixels. These shadows have sharp edges, like the one under a wall outlet.

**Inset** (a well, a text input, a checkbox):
1. Light the bottom lip — a bottom border or inset shadow with a *negative* vertical offset.
2. Add a small dark inset shadow with a positive vertical offset, so the blocked light appears at the top and does not poke through at the bottom.

Stop before photorealism. Borrowed cues add depth; simulation adds noise.

## Shadows mean elevation

A shadow is a position on the z-axis, not decoration. Tight blur and small offset = barely lifted. Large and soft = close to the user. **The closer something feels, the more attention it attracts** — which makes elevation a hierarchy tool.

- **Small** — buttons. Noticeable, not dominant.
- **Medium** — dropdowns, popovers. Clearly above the page.
- **Large** — modals. Demanding attention.

Five steps is plenty for an elevation system: define the smallest and largest, then fill in roughly linearly. This repo currently ships `--brand-shadow-card` (`shadow-card`) and `--brand-shadow-focus`; anything beyond those is a token request needing approval, not an inline `shadow-[...]`.

**Choose by intent, not by looks.** Do not ask "what shadow does this need" — ask where the element sits on the z-axis and take the matching step.

Shadows also carry interaction state: a dragged list item that gains a shadow visibly pops above its neighbours; a button that drops to a smaller shadow (or none) on `:active` feels pressed into the page.

## Two-part shadows

Good shadows are often two shadows doing two different jobs:

- A **large, soft** one — considerable vertical offset, large blur — simulating the shadow cast by a direct light source.
- A **tight, dark** one — small offset, small blur — simulating the area directly beneath the object where even ambient light cannot reach.

Together they let the outer shadow stay subtle while the edge stays well defined.

**The tight shadow fades with elevation.** Lift an object off your desk and the dark contact shadow disappears. So make it distinct at your lowest elevation and nearly or completely absent at your highest.

## Depth without shadows

Flat design is not depthless design.

- **Colour reads as distance.** Among shades of one colour, lighter feels nearer and darker feels further. Make an element lighter than its background to raise it, darker to recess it. This works in non-flat designs too.
- **Solid shadows** — short, vertically offset, zero blur — lift a card or button while keeping the flat aesthetic.

## Overlap to create layers

Overlapping is the strongest depth cue available and needs no effects at all.

- Offset a card so it straddles the boundary between two background sections.
- Make an element taller than its parent so it overhangs on both sides.
- Use it at component scale too — carousel controls sitting over the image edge.

Overlapping images clash easily. Give each an **invisible border matching the page background**, so a gap always separates them.
