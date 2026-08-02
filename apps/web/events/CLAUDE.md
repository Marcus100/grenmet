# Barrels Events

Port **3009**. Package: `@barrelsgd/web-events`.

## Product boundary

- This app is the organiser-facing Events operating console.
- Keep attendee ticket purchase, staff scanning, Bingo, and the in-event
  companion as distinct experiences.
- The canonical product loop is event setup → ticket sale → admission →
  settlement.

## UI rules

- Default to Server Components.
- Use `@barrelsgd/ui` primitives and GrenMet foundation tokens.
- Design desktop-first for organisers, with a usable responsive summary.
- Treat settlement, exceptions, offline readiness, and auditability as primary
  product information rather than secondary reports.
