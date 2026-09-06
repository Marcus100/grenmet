# Colour

## Think in HSL

Hex and RGB hide the relationships between colours that are obviously related to the eye. HSL exposes the three attributes people actually perceive:

- **Hue** — position on the wheel in degrees. 0° red, 120° green, 240° blue.
- **Saturation** — how vivid. 0% is grey; at 0% saturation, hue is meaningless.
- **Lightness** — 0% black, 100% white, 50% the pure hue.

Do not confuse HSL lightness with HSB brightness. Design tools favour HSB; browsers only speak HSL.

## Five hex codes is not a palette

A real interface needs three categories, each with many shades:

- **Greys** — text, backgrounds, panels, form controls; almost everything. You want **8–10 shades**, starting from a very dark grey rather than true black, which looks unnatural.
- **Primary** — one, maybe two colours for primary actions and active nav. **5–10 shades**: ultra-light for tinted backgrounds like alerts, dark for text.
- **Accents** — semantic states (red destructive, yellow warning, green positive) plus attention-grabbers, each with multiple shades even though they are used sparingly. Categorical data — chart series, calendar events, tags — needs more still.

A complex UI can legitimately need ten colours at 5–10 shades each.

**In this repo you do not build this.** Layer 1 (`--brand-*`, `--status-*`) holds the palette; Layer 2 (`--primary`, `--muted-foreground`, `--warning`, `--warning-soft`, `--destructive`, `--chart-1…5`) is what components consume. Components reference the semantic layer, never a brand primitive — that is what makes a rebrand a one-file change. Adding a shade requires user approval.

## Define shades up front

Never generate shades on the fly with `lighten()` / `darken()` / ad-hoc `color-mix()` — that is how you end up with 35 indistinguishable blues.

The method, for when a palette genuinely has to be built:

1. **Base first** — for primary and accent colours, pick the shade that would work as a button background. There is no rule like "start at 50% lightness"; hues behave differently.
2. **Find the edges** — the darkest shade is usually text, the lightest a tinted background. An alert component uses both, so it is a good place to pick them.
3. **Fill the gaps** — call them 100 (lightest), 500 (base), 900 (darkest). Pick 300 and 700 as the perfect compromise in each gap, then 200/400/600/800 the same way. Nine shades divides cleanly.
4. **Greys** the same way, but the base matters less: pick the darkest from your darkest text, the lightest from a subtle off-white background.

Then trust your eyes over the numbers and tweak — but tweak rarely. A palette you keep adding to is not a system.

## Lightness kills saturation

Near 0% or 100% lightness, saturation stops registering — the same saturation value looks more colourful at 50% lightness than at 90%. **Increase saturation as lightness moves away from 50%**, or your light and dark shades look washed out.

When saturation is already at 100%, use **perceived brightness** instead. Every hue has an inherent brightness: yellow, cyan and magenta (60°, 180°, 300°) are local maxima; red, green and blue (0°, 120°, 240°) are local minima. So:

- To make a colour **lighter**, rotate the hue toward the nearest bright hue.
- To make it **darker**, rotate toward the nearest dark hue.

This is how you get a yellow ramp whose dark shades read as warm and rich rather than muddy brown — rotate toward orange as lightness drops. **Stay within 20–30°**; beyond that it stops looking like the same colour.

## Greys do not have to be grey

Most greys that look right are saturated. A little blue makes them cool, a little yellow or orange makes them warm. Keep the temperature consistent across the ramp by raising saturation at the light and dark ends, or those shades will look washed out next to the mid-tones.

## Accessible is not ugly

WCAG wants 4.5:1 for normal text (under ~18px) and 3:1 for large text.

- **Flip the contrast.** White text on a coloured background often needs the background to be very dark to pass — which grabs attention the element may not deserve. Dark coloured text on a light tint of the same colour passes easily and sits back in the hierarchy. That is exactly what the `*-soft` tier is for here: `bg-warning-soft` / `text-warning-soft-foreground`, `bg-primary-soft` / `text-primary-soft-foreground`.
- **Rotate the hue** for coloured text on a coloured background. Adjusting only lightness and saturation drives you toward white before you reach 4.5:1; rotating toward a brighter hue gains contrast while staying colourful.

Run `pnpm design-system:contrast` to check warning foreground/background pairs.

## Never rely on colour alone

Red-green colourblind users cannot read a metric card that signals direction with colour only — add an up or down icon. For multi-series charts, **separate series by contrast (light vs dark) rather than by hue**; light/dark differences survive colourblindness where distinct hues do not.

Colour supports something the design is already saying. It is never the only thing saying it. For public warnings and bulletins this is enforced by the Warning Pattern Checklist in `docs/design-system.md`.
