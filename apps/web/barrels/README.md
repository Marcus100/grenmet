# Barrels Grenada

Static holding page for `https://barrels.gd`, independently hosted on Vercel.
`www.barrels.gd` redirects permanently to the apex. Application wildcards remain
on DigitalOcean; Elections remains its own Vercel project.

Build from the repository root: `node apps/web/barrels/build.mjs`.
Test: `node --test apps/web/barrels/site.test.mjs`.

Vercel project: `barrels-grenada`. Root: `apps/web/barrels`. Include files outside
the root directory for the shared CSS token source. No install command, packages,
environment variables, backend or runtime JavaScript. Build output: `dist/`.

The build copies the shared UI root tokens into the output instead of maintaining
a second palette. Edit `index.html` and `style.css`, not the generated output.
