---
description: Implement or refine a UI component against a design reference — extract intent, list discrepancies, propose changes, iterate
allowed-tools: Bash(pnpm dev:*), Bash(pnpm design-system:*), Read, Edit, Glob, Grep
---

## UI Check

Figma is not linked to this repo. The design reference is a Claude Design canvas,
a screenshot the user supplies, or a written description. Never ask for a Figma
frame URL or reach for a Figma MCP tool.

**Step 1 — Gather info**
Ask the user for:
- The design reference (Claude Design canvas, a pasted/attached screenshot, or a description)
- The component file path (or "new component" if creating from scratch)
- Target viewport(s): mobile (375px), desktop (1280px), or both

Do not proceed until you have all three. If the user has no reference yet, offer
to build one first with the `/design` skill.

**Step 2 — Establish the design intent**
From the reference, write down the intended colors, typography (size, weight,
line-height, family), spacing, border-radius, layout direction, and component
hierarchy.

Map every value onto the token contract before comparing: a color must resolve to
a `--gm-*` token, a Tailwind alias, or a shadcn semantic. If an intended value has
no token, say so explicitly — that is a token request needing user approval, not
something to hardcode.

**Step 3 — Audit the current implementation**
Read the component file. Compare it against the intended values. List every
discrepancy:
- Typography (weight, size, line-height, family)
- Spacing (padding, margin, gap)
- Color (background, text, border)
- Border radius
- Layout / alignment
- Missing or extra elements

Present this list to the user. Do not edit files yet.

**Step 4 — Propose changes**
Show the proposed code changes. Wait for the user to approve before editing.
Flag separately any change that would need a new or altered `--gm-*` token.

**Step 5 — Apply and hand off**
After approval, apply the changes. Run `pnpm design-system:check` to confirm the
token contract still holds. Tell the user which dev command to run to preview
(`pnpm dev:web:gms`, `pnpm dev:web:gaa-admin`, etc. — see `docs/ports.md`) and ask
them to screenshot the result.

Dev servers run on the host, never inside the devcontainer.

**Step 6 — Iterate**
When the user shares the screenshot or describes remaining issues, return to
Step 3 with the updated state. Continue until the user declares done.
