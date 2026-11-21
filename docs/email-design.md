# Customer email standard

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-21

React Email is the single design source for every email. The shared layout is
`EmailLayout` in `packages/email-templates/src/components/layout.tsx`; the generic
card template is `card` (`src/card.tsx`). Python never writes email markup by
hand: it builds a card as data (`apps/api/fastapi/src/email_layout.py`) and the
render service turns it into HTML and text.

## Anatomy, top to bottom

1. Eyebrow: product or business name (grey, small, uppercase).
2. Chip (optional): a status word. Live statuses use the accent, ended ones grey.
3. Title: one plain sentence, navy, 24px.
4. Greeting (optional): "Hello Ann," (first name only).
5. Paragraphs: short plain sentences.
6. Code block (optional): a verification code, large monospace.
7. Details: label and value rows, grey label column.
8. Primary button: one full-width table button, 44px tall.
9. Secondary buttons: full-width outline buttons (calendar links).
10. Copy-the-link line (optional): "If the button does not work...".
11. Policy lines: refund or cancellation terms.
12. Quiet paragraph (optional): secondary text with one link (an invitation).
13. Divider, then footer: why the reader got the mail and who to contact.

A card with one button and no details (password reset) is valid. Empty sections
are omitted, never shown blank.

## Colour

- Page `#f3f8fc`, card white, 8px radius, ink `#0b132b`, body `#374151`, muted `#6b7280`.
- Accent default: Barrels navy `#0b132b` (`--gm-navy`). It fills the chip, the primary
  button and link text. A caller's accent is kept only when it is six-digit hex and
  reaches 4.5:1 against white; otherwise navy is used.
- Buttons and chips set the background on the table cell (`bgcolor` and
  `background-color`), so dark-mode clients and Outlook keep them.

## Accessibility and safety

- Body text at least 4.5:1 against its background; large text at least 3:1.
- Buttons at least 44px tall and full width.
- Every value is escaped. Links must be absolute http or https with no spaces or
  control characters; any other link is dropped.
- No external images, fonts, stylesheets or JavaScript.
- Ticket codes and QR tokens never go in a mail. Two exceptions: a verification
  code (the purpose of that mail) and the signed manage link behind a Bookings
  "Manage booking" button.

## How Python sends a card

1. Build an `EmailCard` (keyword arguments; `subject` set with `with_subject`).
2. Queue it on the outbox: `template="card"`, `props=to_props(card)`. Nothing is
   rendered at queue time.
3. Delivery (`notifications/dispatch.py`) rebuilds the card with `from_props`, then
   calls `render_card`: the render service (`/api/email/render`, template `card`)
   returns `html`, `text` and `subject`.
4. `send_email` sends HTML with the text part (`text_content`).

Rendering at delivery means a render-service outage never loses a mail: the
Python fallback renders it, and a send failure retries through the outbox as before.

## The Python fallback

`render_fallback(card)` is plain Python rendering of the same card. It is used when
`EMAIL_RENDER_URL` is not set or the render call fails. It is correct and readable,
not pixel-matched to React Email. Keep the two in step on structure and wording,
not on pixels.

## Adding a card

- Add the content in Python (a builder returns an `EmailCard`); add no markup.
- Add a test on the facts (names, times with the time zone, amounts, links) by
  rendering with `render_fallback`.
- Only add a layout variant to `EmailLayout` (and the matching fallback) if a
  mail needs something the anatomy lacks.
- Preview: `PreviewProps` in `card.tsx` uses made-up data.
