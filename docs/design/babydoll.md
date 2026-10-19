---
version: alpha
name: Babydoll Beauty Bar
description: Client salon site — logo cream and black, booking-page blush, a slate-teal hairline; thin high-contrast display serif over Montserrat.
colors:
  paper: "#f8f4ef"
  paper-2: "#f1ebe4"
  line: "#ddd4cb"
  ink: "#111010"
  ink-soft: "#5b5552"
  blush: "#fcd7df"
  blush-deep: "#2a1218"
  blush-ink: "#8a3c4f"
  rule: "#496e77"
---

# Babydoll Beauty Bar

A client website, not a Barrels or GMS surface: it uses the client's own brand,
never `--gm-*` tokens or Barrels branding (except the "Website by Barrels Grenada"
footer credit). Source: `apps/web/babydoll/src/app/globals.css`.

- **Type:** the brand's primary face is Adorn Story (licensed; the client
  supplies the web font) with Italiana standing in through `next/font`;
  Montserrat is the secondary face for body, labels and buttons. Display type
  is for headings, prices and short labels only; quotes and body copy stay in
  Montserrat for legibility.
- **Colour:** cream paper and black ink from the logo; blush (`#fcd7df`, the
  Acuity booking-page accent) for chips, the rating badge and the Google review
  panel; `blush-ink` for accent words and small blush text; the slate-teal
  `rule` (sampled from the brand sheet, approximate until the client confirms
  the hex) only as a short hairline under headings and under Book links.
- **Layout:** monogram-led hero with a floating rating badge; a printed
  "menu card" price list with dotted leaders; arched package cards; a black
  "Visit the studio" band; a numbered lash calendar (a real sequence).
- **Booking first:** every page reaches the Acuity booking page in one tap.
  Phones get a fixed "Book me" bar; every bookable service has its own Book link.
  "By appointment only" sits with the opening hours everywhere they appear.
- Dark mode follows the system setting and inverts the monogram.
