# Barrels Grenada holding page

- Independent static Vercel site for `barrels.gd`; `www` redirects to the apex. Existing application subdomains remain independent.
- Plain HTML/CSS, no JavaScript runtime or dependencies. Build with `node apps/web/barrels/build.mjs` from the repository root.
- Reuse the shared UI token declarations; never import GMS branding. Design: `docs/design/barrels.md`.
- Verify with `node --test apps/web/barrels/site.test.mjs`. Output `dist/` is generated and ignored.
