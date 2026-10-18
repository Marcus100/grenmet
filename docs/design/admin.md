---
version: alpha
name: Barrels admin
description: Quiet, dense staff console for the Barrels control plane. Shared @barrelsgd/ui tokens only; no local palette.
colors:
  primary: "#15006b"
  primary-accent: "#2478f2"
  background: "#ffffff"
  surface: "#f3f8fc"
  foreground: "#111827"
  muted-foreground: "#6b7280"
  border: "#d0d5dd"
  success: "#00843d"
  destructive: "#cc0033"
---

# Barrels admin

The control plane at `apps/web/admin`. It is an internal console, not a marketing
surface, and it is not the GAA staff portal: it must never borrow `gaa-admin`
modules, GMS tokens or client branding.

- **Tokens:** only the foundation block from `@barrelsgd/ui/styles/globals`
  (shadcn semantics such as `bg-background`, `text-muted-foreground`, `border`).
  The app defines no colours of its own, so dark mode and any future preset
  re-skin it for free. New tokens need approval.
- **Layout:** one header (product name, Overview, Organisations, signed-in
  email, Sign out) over a single `max-w-6xl` column. Dense tables, 16px gutters,
  usable at phone width.
- **Status:** every status is written out (OK, Problem, Unknown) next to a
  badge; colour is never the only signal. A status the API cannot report is
  `Unknown`, never a made-up green.
- **Placeholders:** work that is not built (verification review, app
  entitlement changes) is a dashed-border note saying it arrives in the next
  slice. No fake rows, no disabled controls that look live.
- **Refusal:** signed-in non-superusers see a plain "Barrels staff only" page
  with no navigation and a sign-out button.
- **Motion and analytics:** none. PostHog stays off; Sentry captures errors
  only, with the shared privacy scrubbing.

Source: `apps/web/admin/src/`. Components come from
`@barrelsgd/ui/components/ui/<name>` (badge, button, card, table, skip-link).
