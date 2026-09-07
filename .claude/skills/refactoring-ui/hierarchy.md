# Hierarchy

Visual hierarchy is how important elements *appear* relative to one another. It is the single largest factor in whether something reads as "designed" — a page whose colour, font and layout are unchanged looks dramatically better once secondary content is pushed back.

## Do not let font size carry it alone

Leaning on size produces primary content that is too large and secondary content that is too small. Weight and colour do the same job with less cost to readability.

- **Colour:** three tiers is enough. Dark for primary, grey for secondary, lighter grey for tertiary. Here: `text-foreground`, `text-muted-foreground`, and a softer step below it.
- **Weight:** two is enough. Normal (400–500) for most text, heavy (600–700) for emphasis. `font-normal` and `font-semibold`.
- **Never go below 400 for UI text.** Light weights are unreadable at small sizes. To de-emphasise, use a lighter colour or a smaller size instead — never `font-light`.

## Grey text on coloured backgrounds

Grey-on-white works because it *reduces contrast*, not because it is grey. On a coloured background, grey fails.

Do not reach for white at reduced opacity: it looks washed out or disabled, and over an image or pattern the background shows through the letterforms. Instead hand-pick a colour that shares the background's hue and adjust saturation and lightness until the contrast is right. In this repo that means using an existing semantic foreground token (`text-primary-foreground`, `text-warning-soft-foreground`) rather than `text-white/70`.

## Emphasise by de-emphasising

When an element will not stand out and there is nothing left to add to it, take emphasis away from what surrounds it.

- An active nav item that will not pop: soften the *inactive* items rather than colouring the active one harder.
- A sidebar competing with the main content: remove its background colour and let the content sit on the page background.

## Labels are a last resort

The naive `label: value` format gives every piece of data equal weight, which destroys hierarchy.

1. **Drop the label** when format or context already identifies the data — `janedoe@example.com`, `(555) 765-4321`, `$19.99`, a department name under a person's name.
2. **Fold the label into the value** — "12 left in stock" rather than "In stock: 12"; "3 bedrooms" rather than "Bedrooms: 3". Now it is one unit you can style freely.
3. **Keep the label as supporting content** when several similar values must be scannable, as on a dashboard. De-emphasise it: smaller, lower contrast, lighter weight, or some combination.
4. **Emphasise the label instead** on information-dense reference pages, where the user is scanning for the word, not the number — someone hunting a phone's dimensions is looking for "depth", not "7.6mm". Even then, keep the value legible: a darker label and a slightly lighter value is usually the whole change.

## Separate visual hierarchy from document hierarchy

Use `h1`–`h6` for semantics; style them for the hierarchy you actually want. Section titles usually behave like labels, not headings — the content in the section is the point, so the title is often small, and sometimes visually hidden while still present in the markup for accessibility.

## Balance weight against contrast

Bold text reads as emphasised because it covers more surface area. The same applies to anything that occupies pixels.

- **Icons are heavy** — especially solid ones — and steal emphasis from adjacent text. There is no icon "weight" to reduce, so lower the contrast instead: give the icon a softer colour.
- **Thin borders are light.** When a 1px border is too subtle in a soft colour but harsh when darkened, increase the width instead of the darkness.

Reducing contrast counterbalances heavy elements; increasing weight counterbalances low-contrast ones.

## Actions sit in a pyramid

Most pages have one true primary action, a couple of secondary ones, and a few tertiary ones. Communicate that, rather than styling by semantics:

- **Primary** — obvious. Solid, high-contrast background.
- **Secondary** — clear but not prominent. Outline or a lower-contrast fill.
- **Tertiary** — discoverable but unobtrusive. Style it like a link.

**Destructive is not automatically primary.** A delete action that is not the page's main action deserves secondary or tertiary treatment; move the big red bold styling to the confirmation step, where destroying really *is* the primary action.
