# gaa-admin-change trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- Change the sidebar layout in apps/web/gaa-admin.
- Update the auth provider used by gaa-admin.
- Add a column to the HR roster table in gaa-admin.

## Should not trigger

- Change the GMS public homepage hero.

## Expected behaviour

Reads the checklist, checks the other folded modules (cap, hr, wxwatch, wxproducts, salesbus) for shared layout, provider or auth impact before editing.
