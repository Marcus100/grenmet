# Skill standard

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-19

How skills in `.claude/skills/` (shared with Codex through `.agents/skills`)
are written, tested and maintained. `scripts/guardrails/skill-lint.test.mjs`
enforces every rule marked **(linted)**. Sources: Anthropic's
[skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
and [Claude Code skills](https://code.claude.com/docs/en/skills), OpenAI's
[Codex skills](https://learn.chatgpt.com/docs/build-skills) and
[best practices](https://learn.chatgpt.com/guides/best-practices), and the
[Agent Skills specification](https://agentskills.io/specification). For
writing craft (leading words, completion criteria, pruning) see the vendored
[`writing-great-skills`](../../.claude/skills/writing-great-skills/SKILL.md).

## Choose the right layer

| Need | Use |
| --- | --- |
| A rule that must hold every time, with no exceptions | A hook or a `permissions.deny` rule, never prose |
| A fact every task needs (commands, boundaries, where things live) | `AGENTS.md`, kept short |
| A procedure or reference needed only for some tasks | A skill |
| Deterministic, repeatable work | A script the skill runs |

Make a skill when you have repeated the same prompt or correction twice.
Keep each skill to one job.

## Frontmatter

- `name`: 1–64 characters, lowercase letters, digits and single hyphens,
  equal to the folder name, without "anthropic" or "claude". **(linted)**
- `description`: 1–1,024 characters, no XML tags, quoted when it contains
  `: `. **(linted)** Third person ("Diagnoses…", not "I can…" or "You
  can…"). State what the skill does, then when to use it, with the words a user
  would actually type, key use first. Claude truncates the listing at 1,536
  characters and Codex shortens descriptions when many skills are installed.
- Model-invoked skills include a "Use when…" clause. **(linted, repo-owned
  skills)**
- Workflows with side effects (push, merge, deploy, publish) set
  `disable-model-invocation: true` and ship `agents/openai.yaml` with
  `policy.allow_implicit_invocation: false`, so neither agent starts them on
  its own. **(linted)** Exception: a workflow `AGENTS.md` already authorizes
  and that routines or other skills must load (`commit`, `release`) stays
  model-invoked; its own steps and the hooks hold the boundaries.
- `allowed-tools` pre-approves only what the skill needs. Claude Code honours
  it; other clients may ignore it.

## Body

- `SKILL.md` stays under 500 lines (about 5,000 tokens). **(linted)** Move
  detail into sibling files linked directly from `SKILL.md`, one level deep;
  linked files must exist. **(linted)** Reference files over 100 lines open
  with a contents list. **(linted)**
- Assume the model is capable. Every sentence must change behaviour; cut
  explanations it already knows.
- Match freedom to fragility: give heuristics where many approaches work, a
  template where one pattern is preferred, and an exact command where a step
  is fragile ("Run exactly: …").
- Give one default with an escape hatch rather than a menu of options.
- Number real sequences and end each step with a checkable completion
  criterion. For long workflows, provide a checklist the agent copies and ticks.
- Close quality-critical work with a feedback loop: run a validator, fix,
  repeat until it passes.
- Show concrete input/output examples where output style matters.
- Use one term per concept throughout. Keep dates and "new in" notes out;
  put superseded methods under an "Old patterns" heading.
- Use forward-slash paths and fully qualified MCP tool names
  (`server:tool`).
- Live context (`` !`cmd` ``) is expanded by Claude Code only, and a failing or
  unapproved command aborts the skill. Use simple read-only commands covered
  by `allowed-tools` (no `|| true` or redirects), and tell Codex to run them.

## Scripts

- Prefer a bundled script for deterministic or fragile operations; say whether
  the agent should run it or read it.
- Scripts handle their own errors with messages that say how to fix the
  problem, document their dependencies, and explain every constant.
- For batch or destructive work, have the agent write a plan file, validate it
  with a script, then execute.

## Testing

Build the evaluation before the instructions.

1. Run the task without the skill and note where the agent fails.
2. Write `evals/triggers.md` beside `SKILL.md` **(linted, repo-owned skills)**:
   at least three prompts that should trigger the skill and one near-miss that
   should not, plus the behaviour you expect.
3. Write the smallest instructions that fix the observed failures.
4. Check triggering: in a fresh Claude Code session and a fresh Codex session,
   send each prompt and confirm the right skill fires (or doesn't).
5. Check behaviour on a real task with a fresh agent, and with every model you
   rely on (Haiku needs more guidance than Opus).
6. Watch how the agent navigates the skill. Files it never opens are
   unnecessary or badly signposted; files it always opens belong in `SKILL.md`.

When an agent makes the same mistake twice, update the skill (or
`AGENTS.md`) and add the case to `evals/triggers.md`.

## Vendored skills

Skills listed in `skills-lock.json` come from upstream repositories. Do not
edit their `SKILL.md`; add only `agents/openai.yaml` and `evals/` files, and
send other improvements upstream or fork the skill under a new name.
