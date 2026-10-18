---
colors:
  background: "#111827"
  foreground: "#ffffff"
  accent: "#39a9f5"
---

# Barrels Grenada

Static company hub: a dark shared text-primary background, inverse text, accent
hover and focus states. Shared UI tokens supply colour and typography; no GMS
palette or assets. Spacious, left-aligned headings. Pages: home (who Barrels is,
the client boundary, newsletter sign-up), services (four packages), contact
(message form) and a subscription status page. No animation and no product
navigation. Forms use plain fields with visible labels, inline messages tied to
each field by `aria-describedby`, and a polite live region for the result. Errors
are never colour-only. Optional analytics is consent-controlled: show a compact
first-visit cookie card with Read more, Accept and Deny. Center it on desktop;
keep it within the mobile viewport. Browser opt-out disables analytics without
counting as an explicit saved choice. The footer keeps the author's personal site
link.

Source: `apps/web/barrels/`. Mobile hides the secondary geographic label; keyboard
focus stays visible. Copy is draft until the owner edits it.
