# Barrels Grenada company hub

- Independent static Vercel site for `barrels.gd`; `www` redirects to the apex. Existing application subdomains remain independent.
- Pages: `index.html` (home and newsletter), `services/`, `contact/`, `subscribe/status/` (confirm and unsubscribe landing). Shared header, footer and privacy card are `partials/*.html`, included at build time by `build.mjs` through `<!-- @include name -->`. Edit pages and partials, never `dist/`.
- Plain HTML/CSS with an optional consent-controlled analytics module and one shared `forms.mjs`; no framework or third-party script. Build with `node apps/web/barrels/build.mjs` from the repository root; it emits the shared analytics policy and Google transport as browser JavaScript.
- Forms are progressive enhancement. `forms.mjs` posts JSON to FastAPI (`https://api.barrels.gd`, or `http://localhost:8000` locally): contact to `POST /api/v1/contact/messages` with `site: "barrels"`, newsletter to `POST /api/v1/subscriptions` with `list_key: "barrels"`. The CSP `connect-src` must keep the API origin, and production `BACKEND_CORS_ORIGINS` must list `https://barrels.gd` and `https://www.barrels.gd`. Never submit natively; the URL would carry the address.
- Copy in `services/` and `index.html` is draft, marked in comments; the owner edits it. Do not claim certifications, partnerships or clients that are not documented.
- Reuse the shared UI token declarations; never import GMS branding. Design: `docs/design/barrels.md`.
- Verify with `node --test apps/web/barrels/site.test.mjs`. Output `dist/` is generated and ignored.
