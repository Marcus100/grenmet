# Barrels Grenada

Static company hub for `https://barrels.gd`, hosted on Cloudflare Pages (project `barrels`).
Its contact and newsletter forms post to the FastAPI API at `api.barrels.gd`.
`www.barrels.gd` redirects permanently to the apex. Application wildcards remain
on DigitalOcean; Elections is its own Cloudflare Pages project.

Build from the repository root: `node apps/web/barrels/build.mjs`.
Test: `node --test apps/web/barrels/site.test.mjs`.

Cloudflare Pages builds from `main` (production) and previews other branches.
Root: `apps/web/barrels`; the build reads the shared CSS token source outside it.
No install command, packages or backend. The old Vercel project `barrels-grenada`
no longer serves the site and is kept only until the owner deletes it. Use Node 24 for the build. Build output: `dist/`.

The small browser analytics module reuses the shared consent policy and Google
transport; no framework is installed. Assign Barrels its own production GA4
property in the service catalogue and verify provider settings before enabling
collection. Unknown preview origins remain disabled. No remote analytics
script loads until the visitor accepts, and collection stops on withdrawal.

The build copies the shared UI root tokens into the output instead of maintaining
a second palette. Edit `index.html` and `style.css`, not the generated output.
