# Learn to Design AI-Agent Workspaces

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-09-24

> This is a tutorial, not just a reference list. Read it in order, inspect the linked files in this repository, and complete the exercises before changing the configuration.

## Your learning mission

You want to understand this system well enough to improve it confidently. By the end, you should be able to:

- explain how an agent discovers and loads repository instructions;
- distinguish AGENTS.md, Claude Code settings, skills, commands, hooks, MCP, subagents, and plugins;
- diagnose why an instruction was ignored;
- turn a repeated procedure into a well-designed skill;
- choose when a rule needs deterministic enforcement;
- identify contradictions and duplicate sources of truth;
- threat-model an agent workflow;
- design a maintainable, portable, observable, and evaluated agent system.

## How to study this note

Each section teaches one concept:

1. Read **The idea**.
2. Open **Your workspace** links and compare them with the explanation.
3. Perform **Try it** before continuing.
4. Answer the **Learning check** from memory.

Do not redesign everything after the first reading. Learn the vocabulary, map the current system, evaluate one workflow, then propose the smallest safe improvement.

## The core model

~~~text
Persistent knowledge      -> AGENTS.md
Reusable procedure        -> SKILL.md
Automatic enforcement     -> hook
Permission boundary       -> settings
External capability       -> MCP
Focused isolated work     -> subagent
Coordinated parallel work -> agent team
Reusable distribution     -> plugin
~~~

When confused, ask:

> Is this a fact, a procedure, an automatic rule, a permission, an external capability, or a worker?

## Course sequence

1. **Instruction layers** — learn what the agent can see.
2. **Permanent context** — decide what belongs in AGENTS.md.
3. **Skills** — turn repeatable work into procedures.
4. **Commands** — understand the older slash-command form.
5. **Hooks** — enforce deterministic behavior.
6. **Permissions** — separate guidance from security boundaries.
7. **MCP** — understand external tools and data.
8. **Subagents and teams** — coordinate focused or parallel work.
9. **Plugins** — package reusable capabilities.
10. **Security** — handle prompt injection and excessive agency.
11. **Evaluation** — test agent behavior like software.
12. **Context engineering** — control what loads and when.
13. **Source of truth** — resolve the duplicate skill trees.
14. **Capstone** — design an api-change skill.

At the end, use the 30-day plan and frontier study path. Ask follow-up questions whenever an exercise is unclear; the goal is durable understanding, not merely finishing a document.

---


This note records the conversation about understanding and improving the repository's AI-agent configuration, especially `.agents/`, `.claude/`, `AGENTS.md`, skills, hooks, permissions, and MCP.

## Core mental model
## Reference guide

The following sections preserve the detailed concepts, resources, and repository-specific findings from the original conversation.

| Surface | Purpose | Local example |
| --- | --- | --- |
| `AGENTS.md` | Persistent repository instructions for coding agents | [`AGENTS.md`](../AGENTS.md) |
| Claude Code AGENTS.md support | Reads the shared project instruction files natively in supported versions | [Claude Code memory docs](https://code.claude.com/docs/en/memory#agentsmd) |
| Skill | Reusable knowledge or workflow | [`.claude/skills/implement/SKILL.md`](../.claude/skills/implement/SKILL.md) |
| Hook | Automatic lifecycle action | [`.claude/settings.json`](../.claude/settings.json) and [`.codex/config.toml`](../.codex/config.toml) |
| Settings | Tool permissions and configuration | [`.claude/settings.json`](../.claude/settings.json) |
| MCP | Connection to external tools and data | No MCP servers are permitted in `settings.json` |
| Subagent | Isolated worker for a focused task | Claude Code agent feature |
| Plugin | Package containing skills, hooks, agents, and MCP | Not currently the main local structure |

Use this rule of thumb:

```text
Always-needed project knowledge -> AGENTS.md
Reusable workflow              -> SKILL.md
Automatic enforcement          -> hook
Permission to act              -> settings
External system connection     -> MCP
Isolated parallel work         -> subagent
```

## What exists in this repository

> **2026-09-24 layout:** `AGENTS.md` is the only project instruction filename.
> Codex reads the instruction chain from the repository root to its working
> directory. Claude Code v2.1.277 and later reads `AGENTS.md` natively by
> default when no `CLAUDE.md` or `CLAUDE.local.md` exists in the working
> directory or any parent. This repository has no `CLAUDE.md` overrides, so
> both tools use the shared instruction tree. The guardrail checks that this
> remains true and that the root instruction map and Codex byte budget stay
> valid. See [Anthropic's AGENTS.md guidance](https://code.claude.com/docs/en/memory#agentsmd).

```text
/workspace
├── AGENTS.md            # canonical rules + instruction map (Codex and Claude)
├── apps/**/AGENTS.md    # per app / FastAPI domain
├── packages/*/AGENTS.md # per shared package
├── docs/playbooks/      # end-to-end recipes linked from AGENTS.md
├── .agents/
│   ├── skills/          # symlink -> ../.claude/skills (canonical)
│   ├── rules/           # project.md (pointer) + ultracite.mdc (TS style)
│   └── commands/
├── .claude/
│   ├── skills/          # canonical playbooks — edit here
│   ├── hooks/           # shared .mjs scripts, invoked by both tools
│   ├── commands/
│   └── settings.json    # Claude Code hooks + permissions
└── .codex/
    └── config.toml      # project_doc_max_bytes + Codex hooks (same scripts)
```

How each tool loads instructions:

| | Codex | Claude Code |
| --- | --- | --- |
| Root and nested files | Concatenates `AGENTS.md` from the git root down to its working directory, up to `project_doc_max_bytes` (65 536 here) | Reads root and ancestor `AGENTS.md` files at session start, then nested `AGENTS.md` as it works in those directories (v2.1.277+) |
| Not loaded automatically | Nested files outside the start path — hence the root instruction map | `.agents/` contents; nested files are loaded as Claude reads in those directories |

`.claude/hooks/` mechanically enforces the local Never tier for both tools.
`block-dangerous-git.mjs` (a `PreToolUse` hook) blocks destructive Git
operations and allows `gh pr merge` only into `dev`, only in this repository,
only with `--match-head-commit` and a complete changed-file list. It blocks
local agent merges of owner-only paths; the review worker also refuses to
auto-merge those paths. Factory-control changes require independent code and
security review before merging into dev. `protect-files.mjs` blocks edits to `.env*`
and generated-client files. Claude Code's `PostToolUse` hook formats the
touched file (`format-changed-file.mjs`); Codex has no auto-format (formatting
is explicit or staged at commit time, so one client never rewrites another's
dirty files), and both tools' `Stop` hook only asks once for
`pnpm verify:changed` when the changes have no passing receipt. A `scripts/guardrails/*.test.mjs` suite
(picked up automatically by `pnpm test:guardrails` and CI) self-checks that
these hooks stay wired correctly — see `check-agent-config.test.mjs` and
`agent-hook-behavior.test.mjs`. The Claude settings file permits selected
`pnpm`, `turbo`, and `gh` read-only operations. The Figma MCP permissions
were removed under [ADR-0012](adr/0012-decouple-design-tooling-from-figma.md).

## Repository instructions

### `AGENTS.md`

`AGENTS.md` is the shared project instruction file for all supported agents. An `AGENTS.md` applies to the directory containing it and its descendants. More deeply nested instruction files are more specific for files below them. Direct system and user instructions take precedence over repository files.

Good content for `AGENTS.md` includes:

- setup and development commands;
- project conventions;
- generated-file rules;
- safety boundaries;
- verification requirements;
- links to deeper documentation.

Long procedures should generally be moved into skills or scripts.

### Claude Code instruction loading

Claude Code v2.1.277 and later supports `AGENTS.md` as a project instruction
file. The default Project instructions mode (`claude-md-or-agents-md`) reads
`AGENTS.md` when no `CLAUDE.md` or `CLAUDE.local.md` exists in the working
directory or an ancestor. A `CLAUDE.md` in that chain takes precedence and
causes the default mode to ignore `AGENTS.md`; the `claude-md-and-agents-md`
mode loads both. This repo deliberately keeps only `AGENTS.md`, so check the
Claude Code version and `/config` Project instructions mode if the shared
instructions do not appear. See [Anthropic's current guidance](https://code.claude.com/docs/en/memory#agentsmd).

## Skills and `SKILL.md`

A skill is a reusable directory containing a required `SKILL.md` file and optional supporting resources:

```text
skill-name/
├── SKILL.md
├── scripts/
├── references/
├── examples/
└── assets/
```

Skills should answer:

1. When should this skill be used?
2. What inputs does it need?
3. What files or systems are in scope?
4. What procedure should it follow?
5. What must it never do?
6. How is the result verified?
7. What output should it produce?

A useful skill structure is:

```markdown
---
name: example
description: Use when ...
---

## When to use this

## Inputs

## Scope

## Procedure

## Safety constraints

## Verification

## Output format
```

Skills are best for reasoning-heavy procedures and reference material. Scripts are better for deterministic operations that would otherwise be rewritten repeatedly.

## Commands versus skills

Claude Code treats `.claude/commands/` as the legacy format; a skill with the same name wins, and skills add supporting files, automatic invocation and `name`/`paths` frontmatter. This repository keeps every workflow as a skill under `.claude/skills/`, which Codex also reads through `.agents/skills`. The former commands (`ci-triage`, `commit`, `pre-merge`, `release`, `ui-check`) are ordinary skills now; edit their `SKILL.md` directly. Follow [the skill standard](agents/skill-standard.md) when writing or changing one.

## Hooks and enforcement

Hooks are appropriate when an action must happen automatically and reliably:

- format after edits;
- block dangerous commands;
- check generated files;
- notify the user;
- run a verification command at a lifecycle boundary.

The distinction is:

```text
Skill: “Remember to run the formatter.”
Hook:  “Run the formatter after every matching edit.”
```

Use a hook for mechanical enforcement. Use a skill when the agent must reason about how to apply a procedure.

Review hooks for network access, unexpected file mutations, recursion, expensive commands, secret exposure, and environment-specific behavior.

## Permissions and settings

Instructions and permissions solve different problems:

```text
Instruction: “Do not push to GitHub.”
Permission:  “The agent cannot run git push.”
```

Classify permissions as:

- read-only actions;
- local mutations;
- external mutations;
- destructive actions.

External actions such as pushing, merging, deploying, sending messages, or changing cloud resources should normally require explicit approval.

## MCP

The Model Context Protocol connects AI applications to external systems. MCP servers can expose:

| Primitive | Meaning |
| --- | --- |
| Prompt | User-controlled template or workflow |
| Resource | Contextual data |
| Tool | Executable action |

No MCP server is currently permitted by [`.claude/settings.json`](../.claude/settings.json); the Figma entries were removed under [ADR-0012](adr/0012-decouple-design-tooling-from-figma.md). The guidance below applies if one is added.

MCP should be evaluated using least privilege, explicit consent, secure credential handling, separation of read and write capabilities, and auditing of external side effects.

## Important local improvement opportunities

### 1. Choose a canonical skill source

**Resolved (2026-09):** `.claude/skills/` is canonical; `.agents/skills` is a
symlink to it. Kept below as an example of the decision process.

There is currently significant duplication between `.agents/skills/` and `.claude/skills/`. Decide whether shared skills should be:

- maintained independently;
- copied from one canonical source;
- symlinked;
- packaged separately;
- intentionally different for Codex and Claude.

Document the decision in `AGENTS.md`.

### 2. Resolve contradictory instructions

**Resolved (2026-09):** `/implement` no longer instructs a commit; the Never
tier is now also enforced by a `PreToolUse` hook, not prose alone. Kept below
as an example of the failure mode.

Known example:

```text
Root AGENTS.md:                    do not commit, push, or merge
.claude/skills/implement/SKILL.md: commit your work
```

The intended policy should be explicit and consistent across the instruction surfaces.

Search for similar conflicts with:

```bash
rg -n "commit|push|merge|deploy|delete|reset|force|\.env" \
  AGENTS.md .agents .claude
```

### 3. Separate policy from procedure

Policy belongs in an instruction file:

```text
Never manually edit generated API client files.
```

Procedure belongs in a skill:

```text
Regenerate OpenAPI, regenerate the client, and run drift checks.
```

### 4. Add verification to workflows

Important skills should end with commands run, pass/fail results, changed files, and known risks. “Done” is not enough evidence.

### 5. Enforce critical rules mechanically

Use permissions or hooks for rules that must always hold, such as blocking edits to environment files, generated directories, or dangerous Git commands.

## Security topics to understand

The most relevant risks are:

- prompt injection from issues, pull requests, webpages, comments, documents, or database content;
- excessive agency caused by unnecessary write permissions or autonomy;
- sensitive information disclosure through files, environment variables, logs, or tool output;
- supply-chain risk from third-party skills, plugins, hooks, and MCP servers.

Treat skills, hooks, and MCP servers like code dependencies. Review their scripts and permissions. Do not place secrets in `AGENTS.md`, skills, hooks, or logs.

## Recommended learning path

### Stage 1: vocabulary

Read:

1. [Claude Code extension overview](https://code.claude.com/docs/en/features-overview)
2. [Agent Skills overview](https://agentskills.io/home)
3. [Codex AGENTS.md documentation](https://github.com/openai/codex/blob/main/codex-rs/models-manager/prompt.md)

Inspect:

- [`AGENTS.md`](../AGENTS.md)
- [`AGENTS.md`](../AGENTS.md)

### Stage 2: skills

Read:

1. [Claude Code skills](https://code.claude.com/docs/en/slash-commands)
2. [Agent Skills specification](https://agentskills.io/specification)
3. [Codex skill creator](https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/skill-creator/SKILL.md)

Inspect:

- [`tdd/SKILL.md`](../.claude/skills/tdd/SKILL.md)
- [`diagnosing-bugs/SKILL.md`](../.claude/skills/diagnosing-bugs/SKILL.md)
- [`implement/SKILL.md`](../.claude/skills/implement/SKILL.md)

### Stage 3: configuration

Read:

1. [Claude Code settings](https://code.claude.com/docs/en/configuration)
2. [Debug Claude Code configuration](https://code.claude.com/docs/en/debug-your-config)
3. [Codex configuration reference](https://developers.openai.com/codex/config-reference)

Inspect:

- [`settings.json`](../.claude/settings.json)
- [`hooks.json`](../.codex/config.toml)

### Stage 4: hooks and MCP

Read:

1. [Claude Code hooks](https://code.claude.com/docs/en/hooks-guide)
2. [MCP introduction](https://modelcontextprotocol.io/docs/getting-started/intro)
3. [MCP architecture](https://modelcontextprotocol.io/specification/2025-06-18/architecture)
4. [MCP authorization](https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization)

### Stage 5: security

Read:

1. [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)
2. [OWASP prompt injection](https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM01_PromptInjection.html)
3. [OWASP excessive agency](https://owasp.org/www-project-top-10-for-large-language-model-applications/2_0_vulns/LLM06_ExcessiveAgency.html)
4. [OWASP prompt injection cheat sheet](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html)
5. [Claude Code Action security guidance](https://github.com/anthropics/claude-code-action/blob/main/docs/security.md)

## Practical exercises

1. Read the root and nested instruction files for `apps/web/gms` and list which rules apply.
2. Label each section of a skill as trigger, fact, procedure, safety rule, verification, or output requirement.
3. Compare the same skill under `.agents/skills/` and `.claude/skills/` and record differences.
4. Classify every permission in `settings.json` as read-only, local mutation, external mutation, or destructive.
5. Design an `api-change` skill that explains OpenAPI regeneration, client regeneration, drift checks, and generated-file boundaries.
6. Threat-model the formatting hook for network access, file mutation, recursion, failure behavior, and secret exposure.

## Shortest useful reading list

If the full guide is too much, start with these five resources:

1. [Claude Code extension overview](https://code.claude.com/docs/en/features-overview)
2. [Claude Code skills](https://code.claude.com/docs/en/slash-commands)
3. [Codex AGENTS.md specification](https://github.com/openai/codex/blob/main/codex-rs/models-manager/prompt.md)
4. [Agent Skills specification](https://agentskills.io/specification)
5. [OWASP Top 10 for LLM Applications](https://owasp.org/www-project-top-10-for-large-language-model-applications/)

The central lesson is:

> Agent configuration is software. It has interfaces, loading rules, dependencies, permissions, tests, security boundaries, and maintenance costs.

## Portable skills

Codex and Claude Code share the skills exposed by `.agents/skills` and `.claude/skills`. A skill that only runs when invoked sets `disable-model-invocation: true` for Claude and ships `agents/openai.yaml` with `policy.allow_implicit_invocation: false` for Codex. `scripts/guardrails/skill-lint.test.mjs` checks every skill against [the skill standard](agents/skill-standard.md), including that parity. Live-context lines (`` !`cmd` ``) are expanded by Claude Code only; each one says that Codex should run the command itself.

### Formatting ownership

Neither client has a mutating Stop hook; the shared Stop hook only checks for a passing `pnpm verify:changed` receipt. Run formatting explicitly on owned files in a shared checkout; the existing staged-file commit hook remains. `fix:changed` includes all dirty and untracked files, so it is safe only when you own that whole change set. Session hooks load the shared handoff but do not write it or establish runtime trust.
