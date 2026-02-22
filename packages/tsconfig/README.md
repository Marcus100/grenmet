# @grenmet/tsconfig

Shared TypeScript configs for the monorepo.

## Presets

- **tsconfig.json** — Base (Node/ESM). Use for API packages and libraries (e.g. api-client, honoapi).
- **tsconfig.nextjs.json** — Next.js apps. Extends the base.

## Usage

### Next.js app

In your app `tsconfig.json`:

```json
{
  "extends": "@grenmet/tsconfig/tsconfig.nextjs.json",
  "compilerOptions": {
    "paths": { "@/*": ["./*"] }
  },
  "include": [
    "next-env.d.ts",
    "**/*.ts",
    "**/*.tsx",
    ".next/types/**/*.ts",
    ".next/dev/types/**/*.ts",
    "**/*.mts"
  ],
  "exclude": ["node_modules"]
}
```
