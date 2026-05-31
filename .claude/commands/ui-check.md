---
description: Implement or refine a UI component against a Figma design — extract tokens, list discrepancies, propose changes, iterate
allowed-tools: mcp__figma__get_design_context, mcp__figma__get_screenshot, mcp__figma__get_metadata, Bash(pnpm dev:*)
---

## UI Check

**Step 1 — Gather info**
Ask the user for:
- The Figma frame URL
- The component file path (or "new component" if creating from scratch)
- Target viewport(s): mobile (375px), desktop (1280px), or both

Do not proceed until you have all three.

**Step 2 — Extract design tokens**
Use `get_design_context` on the Figma frame URL to extract: colors, typography (size, weight, line-height, font-family), spacing, border-radius, layout direction, and component hierarchy.

Use `get_screenshot` to capture the visual reference.

**Step 3 — Audit the current implementation**
Read the component file. Compare it against the extracted tokens. List every discrepancy:
- Typography (weight, size, line-height, family)
- Spacing (padding, margin, gap)
- Color (background, text, border)
- Border radius
- Layout / alignment
- Missing or extra elements

Present this list to the user. Do not edit files yet.

**Step 4 — Propose changes**
Show the proposed code changes. Wait for the user to approve before editing.

**Step 5 — Apply and hand off**
After approval, apply the changes. Tell the user which dev command to run to preview (`pnpm dev:web:spicewx`, etc.) and ask them to screenshot the result.

**Step 6 — Iterate**
When the user shares the screenshot or describes remaining issues, return to Step 3 with the updated state. Continue until the user declares done.

---

Figma MCP note: load `/figma-use` skill if you need to write back to Figma. For read-only inspection, `get_design_context` and `get_screenshot` are sufficient without it.
