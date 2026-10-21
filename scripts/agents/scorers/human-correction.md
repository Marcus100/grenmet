---
name: human-correction
description: The human had to correct, redirect or repeat themselves, which points at a missing or unclear instruction.
sample: 0.5
min_tools: 0
---

Read the human prompts in order.

**Pass** when the human only gave new work, approvals or answers to questions
the agent asked.

**Fail** when a later prompt corrects the agent ("no", "I said", "that's
wrong", "don't", "again", "you forgot"), repeats an earlier instruction, or
undoes something the agent did. In `suggestion`, name the instruction (a skill,
`AGENTS.md` rule or doc) that would have prevented the correction, and how to
word it.

**Not applicable** when there is only one human prompt.
