# auth (`@grenmet/web-auth`)

Shared sign-in gateway for all Grenmet web apps. Port **3000**. No database. No `pnpm start` required.

Every other app redirects here for authentication. Does not handle any domain logic — auth flows only.

See [CLAUDE.md](./CLAUDE.md) for session model, route structure, and key conventions.
See [docs/web/development.md](../../../docs/web/development.md) for startup commands.
