# api-change trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- I added a `priority` field to the CAP alert schema in apps/api/fastapi/src/cap/schemas.py.
- The HR leave page needs `approved_by`, but @barrelsgd/api-client doesn't expose it yet.
- Add a new GET /wxwatch/stations/{id}/latest route and wire it into gms.

## Should not trigger

- Fix the typo in the CAP alert page heading in apps/web/gaa-admin.

## Expected behaviour

Regenerates openapi.json, runs pnpm generate:api-client and pnpm check:drift, updates docs/api/contracts.md and every web consumer of the changed hook or type.
