# HR (`@grenmet/web-hr`)

HR document printing app for GMS staff. Port **3006**.

Renders print-ready A4 forms: leave of absence applications, official timesheets, duty rosters, shift exchange requisitions, and daily airport status reports.

## Development

From repo root:

```bash
pnpm install
pnpm dev:web:hr
```

The app runs on `http://localhost:3006`.

## Run from app directory

```bash
cd apps/web/hr
pnpm dev
```

## Quality Commands

```bash
pnpm check
pnpm check:ci
pnpm type-check
```
