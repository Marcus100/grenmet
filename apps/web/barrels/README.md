# Barrels Grenada

Static holding page for `https://barrels.gd`, independently hosted on Vercel.
`www.barrels.gd` redirects permanently to the apex. Application wildcards remain
on DigitalOcean; Elections remains its own Vercel project.

Build from the repository root: `node apps/web/barrels/build.mjs`.
Test: `node --test apps/web/barrels/site.test.mjs`.

Vercel project: `barrels-grenada`. Root: `apps/web/barrels`. Include files outside
the root directory for the shared CSS token source. No install command, packages,
environment variables or backend. Use Node 24 for the build. Build output: `dist/`.

The small browser analytics module reuses the shared consent policy and Google
transport; no framework is installed. Assign Barrels its own production GA4
property in the service catalogue and verify provider settings before enabling
collection. Unknown Vercel preview origins remain disabled. No remote analytics
script loads until the visitor accepts, and collection stops on withdrawal.

The build copies the shared UI root tokens into the output instead of maintaining
a second palette. Edit `index.html` and `style.css`, not the generated output.
