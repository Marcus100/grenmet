# Interface craft

Refactoring UI covers how a screen *looks*. This chapter covers how it *behaves*: states, interaction, access and wording. It draws on the [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines), the [GOV.UK Design System](https://design-system.service.gov.uk/accessibility/accessibility-strategy/) and WCAG 2.2 AA, applied to this repo. Check it last. A screen can be clean on every other rung and still fail a keyboard user.

## Design every state, not just the happy one

The first draft usually shows full data. Real screens also have to handle:

- **Empty:** say what it means and offer the action that fills it. "No warnings in force" is useful information, not a blank space.
- **Loading:** show a skeleton that matches the final layout, delay it about 150ms so fast loads don't flicker, and avoid any layout shift.
- **Error:** say what failed and what to do next. A toast must never be the only record of an error.
- **Stale or partial:** show a timestamp ("Latest observation 06:00 AST") and label sample data.
- **Extremes:** check one item, a thousand items, and a 60-character station name.

## Interaction

- Use `<a>`/`<Link>` for navigation and `<button>` for actions, never a `div` with an `onClick`.
- Anything that looks interactive must be interactive. Checkbox and radio labels share the control's hit target.
- Hit targets are at least 24px everywhere and at least 44px for primary touch actions.
- Hover, active and focus states have *more* contrast than rest.
- State that deserves a URL (filters, tabs, pagination, the open record) lives in search params.
- Destructive actions name their object in the confirmation ("Delete leave request for J. Doe?"), or offer Undo.
- A loading button keeps its label and adds a spinner, and stays enabled until it's actually submitting.

## Keyboard and focus

- The whole flow works from the keyboard, with a visible `:focus-visible` ring that nothing covers.
- Dialogs trap focus and return it to the trigger when they close.
- Each page has one `h1`, no skipped heading levels, and a "Skip to content" link as the first focusable element.
- Icon-only buttons have an `aria-label`. Decorative icons get `aria-hidden`.

## Forms

- Every field has a visible label. A placeholder is an example, not a label.
- Errors appear next to the field. On submit, focus moves to the first error and the message says how to fix it.
- Set the right `type`, `inputmode` and `autocomplete`. Never block paste. Inputs are at least 16px on mobile so iOS doesn't zoom.
- Warn before the user leaves with unsaved changes.

## Contrast beyond text

- Text needs at least 4.5:1, or 3:1 at 24px regular / 18.66px bold and larger. The lane specs list tested pairs.
- A control whose outline is what identifies it (an input, a checkbox) needs at least 3:1 against its background. Hairline border tokens don't meet that, so a visible label has to carry the field.
- Colour is never the only signal. Pair it with a word or an icon.

## Motion

- Animate only to show cause and effect, or for one deliberate moment. Scattered effects make a page noisy.
- Animate `transform` and `opacity` only, and never use `transition-all`.
- Honour `prefers-reduced-motion`. `MotionProvider` does this for Motion components; CSS transitions need `motion-safe:`.

## Typography details

- Use `tabular-nums` for any numbers people compare (times, temperatures, amounts).
- Use `text-balance` on headings and `text-pretty` on short paragraphs to avoid orphans.
- Use `…` rather than `...`, and curly quotes. Put a non-breaking space between a number and its unit (`10&nbsp;mm`).
- Keep the reading measure to 75 characters or fewer.

## Avoid the generic "AI" look

A plausible first draft drifts toward the same defaults: gradient hero numbers, glassy cards, a SaaS card grid with no hierarchy, emoji as icons, uppercase labels on everything, and cream-and-terracotta or black-and-acid-green palettes. Start instead from the subject's own vernacular. For GMS that's the dated bulletin; for mbia, the departures board; for signal, the newspaper section. Write a two-line plan (the single most important element and the one primary action) before writing code.

## Words

The words are part of the interface. Use plain language first and technical terms second, in the active voice, with numerals for counts. Keep the same noun for the same thing throughout a flow. Button labels say what happens ("Issue forecast", not "Continue"). GMS copy follows the brand kit's voice: clear, credible, calm, and focused on helping people. It says what is happening, what it means, and what to do next.
