# Learn to Design AI-Agent Workspaces

> This is a tutorial, not just a reference list. Read it in order, inspect the linked files in this repository, and complete the exercises before changing the configuration.

## Your learning mission

You want to understand this system well enough to improve it confidently. By the end, you should be able to:

- explain how an agent discovers and loads repository instructions;
- distinguish AGENTS.md, CLAUDE.md, skills, commands, hooks, settings, MCP, subagents, and plugins;
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
Persistent knowledge      -> AGENTS.md / CLAUDE.md
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
2. **Permanent context** — decide what belongs in AGENTS.md and CLAUDE.md.
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


This note records the conversation about understanding and improving the repository's AI-agent configuration, especially `.agents/`, `.claude/`, `AGENTS.md`, `CLAUDE.md`, skills, hooks, permissions, and MCP.

## Core mental model
## Reference guide

The following sections preserve the detailed concepts, resources, and repository-specific findings from the original conversation.

| Surface | Purpose | Local example |
| --- | --- | --- |
| `AGENTS.md` | Persistent repository instructions for coding agents | [`AGENTS.md`](../AGENTS.md) |
| `CLAUDE.md` | Persistent Claude Code instructions | [`CLAUDE.md`](../CLAUDE.md) |
| Skill | Reusable knowledge or workflow | [`.claude/skills/implement/SKILL.md`](../.claude/skills/implement/SKILL.md) |
| Command | Older Claude slash-command format | [`.claude/commands/pre-merge.md`](../.claude/commands/pre-merge.md) |
| Hook | Automatic lifecycle action | [`.agents/hooks.json`](../.agents/hooks.json) |
| Settings | Tool permissions and configuration | [`.claude/settings.json`](../.claude/settings.json) |
| MCP | Connection to external tools and data | No MCP servers are permitted in `settings.json` |
| Subagent | Isolated worker for a focused task | Claude Code agent feature |
| Plugin | Package containing skills, hooks, agents, and MCP | Not currently the main local structure |

Use this rule of thumb:

```text
Always-needed project knowledge -> AGENTS.md / CLAUDE.md
Reusable workflow              -> SKILL.md
Automatic enforcement          -> hook
Permission to act              -> settings
External system connection     -> MCP
Isolated parallel work         -> subagent
```

## What exists in this repository

The repository has two overlapping agent configuration trees:

```text
/workspace
├── AGENTS.md
├── CLAUDE.md
├── .agents/
│   ├── skills/
│   ├── rules/
│   └── hooks.json
└── .claude/
    ├── skills/
    ├── commands/
    └── settings.json
```

The `.agents/skills/` and `.claude/skills/` directories contain substantial overlap, including skills for implementation, TDD, triage, debugging, prototyping, domain modeling, grilling, and handoff. This may be intentional, but it creates synchronization and ownership questions.

The current hook in [`.agents/hooks.json`](../.agents/hooks.json) runs `pnpm dlx ultracite fix` after a file edit. The Claude settings file permits selected `pnpm`, `turbo`, and `gh` operations. The Figma MCP permissions were removed under [ADR-0012](adr/0012-decouple-design-tooling-from-figma.md).

## Repository instructions

### `AGENTS.md`

`AGENTS.md` is the main Codex instruction file. An `AGENTS.md` applies to the directory containing it and its descendants. More deeply nested instruction files are more specific for files below them. Direct system and user instructions take precedence over repository files.

Good content for `AGENTS.md` includes:

- setup and development commands;
- project conventions;
- generated-file rules;
- safety boundaries;
- verification requirements;
- links to deeper documentation.

Long procedures should generally be moved into skills or scripts.

### `CLAUDE.md`

`CLAUDE.md` serves a similar role for Claude Code. It should contain short, stable context that Claude needs in most sessions:

- architecture;
- commands;
- testing conventions;
- project rules;
- important file locations.

Detailed release, debugging, migration, or review procedures belong in skills.

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

Files under `.claude/commands/` are Claude slash commands. They remain useful for short, explicitly invoked actions, but skills provide additional capabilities such as supporting files, automatic invocation, controlled visibility, and isolated execution.

The local [`pre-merge.md`](../.claude/commands/pre-merge.md) is a strong workflow example. It defines checks, an analysis-only boundary, and a required output format. A gradual migration approach is safer than rewriting every command:

1. Choose one command.
2. Copy it into a skill directory.
3. Improve its description and structure.
4. Verify equivalent behavior.
5. Keep the command temporarily as a compatibility layer.
6. Remove it only after the skill is proven.

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

There is currently significant duplication between `.agents/skills/` and `.claude/skills/`. Decide whether shared skills should be:

- maintained independently;
- copied from one canonical source;
- symlinked;
- packaged separately;
- intentionally different for Codex and Claude.

Document the decision in `AGENTS.md` and `CLAUDE.md`.

### 2. Resolve contradictory instructions

Known example:

```text
Root AGENTS.md:                    do not commit, push, or merge
.claude/skills/implement/SKILL.md: commit your work
```

The intended policy should be explicit and consistent across the instruction surfaces.

Search for similar conflicts with:

```bash
rg -n "commit|push|merge|deploy|delete|reset|force|\.env" \
  AGENTS.md CLAUDE.md .agents .claude
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

Treat skills, hooks, and MCP servers like code dependencies. Review their scripts and permissions. Do not place secrets in `AGENTS.md`, `CLAUDE.md`, skills, hooks, or logs.

## Recommended learning path

### Stage 1: vocabulary

Read:

1. [Claude Code extension overview](https://code.claude.com/docs/en/features-overview)
2. [Agent Skills overview](https://agentskills.io/home)
3. [Codex AGENTS.md documentation](https://github.com/openai/codex/blob/main/codex-rs/models-manager/prompt.md)

Inspect:

- [`AGENTS.md`](../AGENTS.md)
- [`CLAUDE.md`](../CLAUDE.md)

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
- [`hooks.json`](../.agents/hooks.json)

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

