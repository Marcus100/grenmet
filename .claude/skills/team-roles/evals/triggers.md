# team-roles trigger cases

Checked by hand in fresh Claude Code and Codex sessions; see docs/agents/skill-standard.md → Testing.

## Should trigger

- Plan the next bookings slice with the planner, then split the work between the API and web engineers.
- Get a fresh-context review of this diff before I commit.
- Use the security reviewer on the new public availability endpoint.

## Should not trigger

- Fix the typo in the leave-request label. (a one-line change needs no roles)

## Expected behaviour

Picks only the roles the task needs, writes a brief for each (task, files, acceptance criteria, out of scope), runs each with a clean context (a subagent in Claude Code, a new task that reads the role brief in Codex), never lets the author review its own change, and requires commands run, files changed and risks back from each role.
