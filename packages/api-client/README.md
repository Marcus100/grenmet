# @grenmet/api-client

Generated TypeScript API client for the FastAPI backend.

## Generated code policy

This package follows a **commit generated code** workflow:

- Generated output in `src/gen` is committed to git.
- CI regenerates the client and fails when committed artifacts are stale.
- Consumers can install and use the package without running code generation.

## Common commands

- `pnpm --filter @grenmet/api-client run generate` - one-time generation.
- `pnpm --filter @grenmet/api-client run generate:watch` - regenerate on spec changes.
- `pnpm --filter @grenmet/api-client run generate:debug` - generate with debug logs.

## Source OpenAPI document

Kubb reads the spec from `../../apps/api/fastapi/openapi.json` via `kubb.config.ts`.
