# Barrels Grenada holding page

- Independent static Vercel site for `barrels.gd`; `www` redirects to the apex. Existing application subdomains remain independent.
- Plain HTML/CSS with an optional consent-controlled analytics module; no framework dependencies. Build with `node apps/web/barrels/build.mjs` from the repository root; it emits the shared analytics policy and Google transport as browser JavaScript.
- Reuse the shared UI token declarations; never import GMS branding. Design: `docs/design/barrels.md`.
- Verify with `node --test apps/web/barrels/site.test.mjs`. Output `dist/` is generated and ignored.
