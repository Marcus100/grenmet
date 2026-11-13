# account (`@barrelsgd/web-account`)

A person's Barrels account at `account.barrels.gd`: their name, email and profile
photo, with the security and organisation pages to follow (ADR-0057). Everyone
with a Barrels account signs in here through `auth.barrels.gd`. Port **3018**.

## Development

Run the app from the repository root on the host (not in the devcontainer):

```bash
pnpm install
pnpm dev:web:account   # http://localhost:3018
```

Signing in needs the FastAPI registration for `account` and a shared
`ACCOUNT_SSO_CLIENT_SECRET` (32 characters or more) in the API and in this app's
`.env.local`. Without them the callback returns 503. See
[`docs/env.md`](../../../docs/env.md) for every variable, and
[`AGENTS.md`](AGENTS.md) for the conventions.

## Tests

```bash
pnpm --filter @barrelsgd/web-account test
pnpm exec tsc --noEmit -p apps/web/account
```

## Deployment

The container image is `barrelsgd-web-account` (see
[`docs/web/deployment.md`](../../../docs/web/deployment.md)). Compose routes
`account.<domain>` to port 3018. The production monitor and DNS record are
separate steps (ADR-0057).
