#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = []
# ///
"""Apply the owner's 21 Nov 2026 agent settings to Claude Code and Codex.

Owner decisions: agents work freely and guard the edges; Codex automates as much
as possible; Codex routes heavy commands through ~/.local/bin/heavy like Claude.

Run it only from the owner's main checkout (not a task worktree: the paths it
writes into the Codex sandbox come from where it runs, and a worktree may hold
unreviewed changes to these files). It refuses to run from a worktree unless
given --from-worktree.

Run once, from the repository's main checkout:
    uv run scripts/agents/settings/apply.py
Dry run:
    uv run scripts/agents/settings/apply.py --dry-run

It finds the repository from its own location and the user's folders from the
home directory, so it works on any machine. Every file it changes is backed up
to ~/.local/state/grenmet-agent-settings/backups/<time>/ first (outside the
repository: the backups hold personal settings); a file that fails validation
after editing is restored. Safe to run twice: it skips what is already there
and rewrites a file only when its content would change.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import tomllib
from datetime import datetime
from pathlib import Path

HOME = Path.home()
HERE = Path(__file__).resolve().parent
# scripts/agents/settings/apply.py -> the checkout this script lives in.
REPO = HERE.parents[2]
DRY = "--dry-run" in sys.argv
FROM_WORKTREE = "--from-worktree" in sys.argv
STAMP = datetime.now().strftime("%Y%m%d-%H%M%S")
BACKUPS = HOME / ".local" / "state" / "grenmet-agent-settings" / "backups" / STAMP

CLAUDE_USER = HOME / ".claude" / "settings.json"
CLAUDE_GRENMET_LOCAL = REPO / ".claude" / "settings.local.json"
CODEX_CONFIG = HOME / ".codex" / "config.toml"
CODEX_RULES = HOME / ".codex" / "rules" / "default.rules"
CODEX_HOOK = HOME / ".codex" / "hooks" / "require-heavy.mjs"

PROTECTED = ("dev", "staging", "main")

AUTO_MODE_ALLOW = (
    "In the Marcus100/grenmet repository and its worktrees (~/grenmet, "
    "~/worktrees/grenmet/*, ~/grenmet/.claude/worktrees/*): committing, pushing an "
    "agent task branch (feat/*, fix/*, docs/*, chore/*, test/*, perf/*, refactor/*, "
    "ci/*, codex/* and similar task prefixes) to origin including follow-up pushes, "
    "opening, updating and commenting on pull requests from those branches into dev, "
    "merging a green, reviewed pull request into dev pinned with --match-head-commit, "
    "and commenting on, labelling or closing issues are pre-approved by the owner "
    "(21 Nov 2026). Writing reports and scripts under ~/workspace-tools is also "
    "pre-approved."
)
AUTO_MODE_SOFT_DENY = (
    "Pushing directly to dev, staging or main, force pushes, deleting remote "
    "branches or tags, pushing tags, publishing releases, changing GitHub "
    "variables, secrets or rulesets, merging anything into staging or main, "
    "production deploys, and spending money always need the owner's explicit OK "
    "in this conversation."
)

CLAUDE_USER_DENY = [
    "Bash(gh repo delete*)",
    "Bash(gh issue delete*)",
    *(f"Bash(git push origin {b})" for b in PROTECTED),
    *(f"Bash(git push origin {b} *)" for b in PROTECTED),
    *(f"Bash(git push origin HEAD:{b}*)" for b in PROTECTED),
    *(f"Bash(git push -u origin {b})" for b in PROTECTED),
    "Bash(git push --tags*)",
    "Bash(git push origin --delete*)",
]

CODEX_TOP_LEVEL = {
    # Ask only when the sandbox blocks something; otherwise work on.
    "approval_policy": '"on-request"',
    "sandbox_mode": '"workspace-write"',
    # Home-folder sessions load the same instruction budget as repo sessions.
    "project_doc_max_bytes": "65536",
}
# Folders Codex may write: the repository, its worktrees, tool caches and /tmp.
# ~/workspace-tools is included only on a machine that has it.
WRITABLE_ROOTS = [
    REPO,
    HOME / "worktrees",
    *([HOME / "workspace-tools"] if (HOME / "workspace-tools").is_dir() else []),
    HOME / ".cache",
    HOME / ".local" / "share" / "pnpm",
    Path("/tmp"),
]
CODEX_SANDBOX_TABLE = (
    """
# Owner decision 21 Nov 2026: automate as much as possible. Worktrees live
# outside the repo folder, and pushes and installs need the network.
[sandbox_workspace_write]
network_access = true
writable_roots = [
"""
    + "".join(f"  {json.dumps(str(root))},\n" for root in WRITABLE_ROOTS)
    + "]\n"
)
CODEX_HOOK_TABLE = """
# Same memory guard as Claude's ~/.claude/hooks/auto-heavy.mjs: heavy commands
# must run through ~/.local/bin/heavy (one heavy job at a time machine-wide).
# Codex asks you to trust this hook once (/hooks).
[[hooks.PreToolUse]]
matcher = "^Bash$"
[[hooks.PreToolUse.hooks]]
type = "command"
command = 'node "$HOME/.codex/hooks/require-heavy.mjs"'
timeout = 10
"""

changes: list[str] = []


def backup(path: Path) -> None:
    if path.exists() and not DRY:
        # Files under the home folder keep their relative path; the repository's
        # local settings file may live elsewhere, so it keeps its full path.
        inside_home = path.is_relative_to(HOME)
        relative = path.relative_to(HOME if inside_home else path.anchor)
        target = BACKUPS / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)


def write_atomically(path: Path, text: str) -> None:
    """Write a temporary file beside the target, then rename it into place, so
    a crash or a full disk never leaves a half-written settings file."""
    target = path.resolve()  # keep a symlinked settings file a symlink
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(
        dir=target.parent, prefix=f".{target.name}.", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
        if target.exists():
            shutil.copymode(target, temporary)
        os.replace(temporary, target)
    except BaseException:
        Path(temporary).unlink(missing_ok=True)
        raise


def write(path: Path, text: str, validate) -> None:
    if path.exists() and path.read_text() == text:
        return  # already up to date: no backup, no rewrite
    try:
        validate(text)  # check before anything touches the disk
    except Exception as error:
        sys.exit(f"Refusing to write {path}: the new content does not validate: {error}")
    if DRY:
        changes.append(f"(dry run) would update {path}")
        return
    backup(path)
    write_atomically(path, text)
    changes.append(f"updated {path}")


def first_table_line(lines: list[str]) -> int:
    """The index of the first [table] header, ignoring a `[` that starts a line
    inside a multi-line array or string: the text before a real header always
    parses as TOML on its own, the text before such a line does not."""
    for index, line in enumerate(lines):
        if not line.lstrip().startswith("["):
            continue
        try:
            tomllib.loads("".join(lines[:index]))
        except tomllib.TOMLDecodeError:
            continue
        return index
    return len(lines)


def worktree_problem() -> str | None:
    """Why this checkout is not a main checkout, or None when it is."""
    result = subprocess.run(
        ["git", "-C", str(REPO), "rev-parse", "--git-dir", "--git-common-dir"],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        return f"{REPO} is not a git checkout"
    git_dir, common_dir = (
        (REPO / line).resolve() for line in result.stdout.split()
    )
    if git_dir != common_dir:
        return f"{REPO} is a worktree, not the main checkout"
    return None


def claude_user() -> None:
    data = json.loads(CLAUDE_USER.read_text()) if CLAUDE_USER.exists() else {}
    auto = data.setdefault("autoMode", {})
    allow = auto.setdefault("allow", [])
    if "$defaults" not in allow:
        allow.insert(0, "$defaults")
    if AUTO_MODE_ALLOW not in allow:
        allow.append(AUTO_MODE_ALLOW)
    soft = auto.setdefault("soft_deny", [])
    if "$defaults" not in soft:
        soft.insert(0, "$defaults")
    if AUTO_MODE_SOFT_DENY not in soft:
        soft.append(AUTO_MODE_SOFT_DENY)
    deny = data.setdefault("permissions", {}).setdefault("deny", [])
    for rule in CLAUDE_USER_DENY:
        if rule not in deny:
            deny.append(rule)
    write(CLAUDE_USER, json.dumps(data, indent=2) + "\n", json.loads)


def claude_grenmet_local() -> None:
    if not CLAUDE_GRENMET_LOCAL.exists():
        return
    data = json.loads(CLAUDE_GRENMET_LOCAL.read_text())
    perms = data.setdefault("permissions", {})
    allow = perms.setdefault("allow", [])
    # "gh repo *" includes "gh repo delete"; keep reads only.
    allow[:] = ["Bash(gh repo view *)" if r == "Bash(gh repo *)" else r for r in allow]
    deny = perms.setdefault("deny", [])
    for rule in ("Bash(gh repo delete*)", "Bash(gh issue delete*)"):
        if rule not in deny:
            deny.append(rule)
    write(CLAUDE_GRENMET_LOCAL, json.dumps(data, indent=2) + "\n", json.loads)


def codex_rules() -> None:
    # The committed rules name the home folder as {{HOME}}.
    rules = (HERE / "default.rules").read_text().replace("{{HOME}}", str(HOME))
    write(CODEX_RULES, rules, lambda _t: None)


def codex_hook() -> None:
    write(CODEX_HOOK, (HERE / "require-heavy.mjs").read_text(), lambda _t: None)


def codex_config() -> None:
    text = CODEX_CONFIG.read_text() if CODEX_CONFIG.exists() else ""
    parsed = tomllib.loads(text)
    lines = text.splitlines(keepends=True)
    # Top-level keys must come before the first [table].
    first_table = first_table_line(lines)
    new_top = [
        f"{key} = {value}\n"
        for key, value in CODEX_TOP_LEVEL.items()
        if key not in parsed
    ]
    lines[first_table:first_table] = new_top
    text = "".join(lines)
    if "sandbox_workspace_write" not in parsed:
        text = text.rstrip("\n") + "\n" + CODEX_SANDBOX_TABLE
    if "require-heavy.mjs" not in text:
        text = text.rstrip("\n") + "\n" + CODEX_HOOK_TABLE
    write(CODEX_CONFIG, text, tomllib.loads)


CLAUDE_JSON = HOME / ".claude.json"
PLAYWRIGHT_CACHE = HOME / ".cache" / "ms-playwright"


def newest_chromium() -> str | None:
    """The newest installed Playwright Chromium (the pin breaks on every upgrade)."""
    builds = sorted(
        (p for p in PLAYWRIGHT_CACHE.glob("chromium-*") if p.name.split("-")[-1].isdigit()),
        key=lambda p: int(p.name.split("-")[-1]),
    )
    for build in reversed(builds):
        chrome = build / "chrome-linux64" / "chrome"
        if chrome.exists():
            return str(chrome)
    return None


def repoint(args: list[str], chrome: str) -> bool:
    if "--executable-path" not in args:
        return False
    i = args.index("--executable-path") + 1
    if i < len(args) and args[i] != chrome:
        args[i] = chrome
        return True
    return False


def playwright_paths() -> None:
    chrome = newest_chromium()
    if chrome is None:
        changes.append("Playwright: no Chromium found under ~/.cache/ms-playwright; skipped")
        return
    if CLAUDE_JSON.exists():
        data = json.loads(CLAUDE_JSON.read_text())
        server = (data.get("mcpServers") or {}).get("playwright")
        if server and repoint(server.setdefault("args", []), chrome):
            write(CLAUDE_JSON, json.dumps(data, indent=2) + "\n", json.loads)
    if not CODEX_CONFIG.exists():
        return
    text = CODEX_CONFIG.read_text()
    old = tomllib.loads(text).get("mcp_servers", {}).get("playwright", {}).get("args", [])
    if "--executable-path" in old:
        current = old[old.index("--executable-path") + 1]
        if current != chrome:
            write(CODEX_CONFIG, text.replace(current, chrome), tomllib.loads)


def main() -> None:
    problem = worktree_problem()
    if problem is not None:
        message = (
            f"{problem}. Run this from the owner's main checkout; "
            "pass --from-worktree only to test the script itself."
        )
        if not (DRY or FROM_WORKTREE):
            sys.exit(message)
        print(f"Warning: {message}\n")
    playwright_paths()
    claude_user()
    claude_grenmet_local()
    codex_rules()
    codex_hook()
    codex_config()
    print("\n".join(changes) or "Nothing to change: this machine is already set up.")
    if BACKUPS.exists():
        print(f"\nBackups: {BACKUPS}")
        print("Restore one with: cp <backup file> <original path>")
        print("Next: restart Claude Code and Codex; in Codex run /hooks and trust the new hook.")


if __name__ == "__main__":
    main()
