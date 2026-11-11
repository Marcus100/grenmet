"""New migrations must not lock or break a live table without a reviewed reason (#1249).

The release runbook keeps migrations additive: the previous release still runs
against the new schema while a deploy rolls, so a drop, a rename or a type change
waits for a later release. This checks only `upgrade()` of migrations added after
the baseline (`migration_safety_baseline.json`, every file that existed when the
check started); the files there are grandfathered.

A deliberate exception carries a comment on the operation's first line or the line
above it: `# migration-safety: <why this is safe>`.
"""

import ast
import json
import re
from dataclasses import dataclass
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BASELINE = Path(__file__).with_name("migration_safety_baseline.json")
VERSION_DIRS = ("alembic/versions", "src/*/migrations/versions")
WAIVER = re.compile(r"#\s*migration-safety:\s*\S")
RISKY_SQL = re.compile(
    r"\b(DROP\s+(TABLE|COLUMN)|ALTER\s+TABLE\s+\S+\s+(RENAME|ALTER\s+COLUMN\s+\S+\s+(SET\s+DATA\s+)?TYPE)|"
    r"RENAME\s+(TO|COLUMN)|SET\s+NOT\s+NULL|LOCK\s+TABLE)\b",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Problem:
    path: str
    line: int
    message: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.message}"


def migration_files() -> list[Path]:
    files: list[Path] = []
    for pattern in VERSION_DIRS:
        files.extend(ROOT.glob(f"{pattern}/*.py"))
    return sorted(path for path in files if path.name != "__init__.py")


def _name(node: ast.expr) -> str:
    if isinstance(node, ast.Attribute):
        return f"{_name(node.value)}.{node.attr}"
    if isinstance(node, ast.Name):
        return node.id
    return ""


def _keyword(call: ast.Call, name: str) -> ast.expr | None:
    return next((kw.value for kw in call.keywords if kw.arg == name), None)


def _is_false(node: ast.expr | None) -> bool:
    return isinstance(node, ast.Constant) and node.value is False


def _is_true(node: ast.expr | None) -> bool:
    return isinstance(node, ast.Constant) and node.value is True


def _string(node: ast.expr | None) -> str:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    if isinstance(node, ast.JoinedStr):
        return "".join(
            part.value if isinstance(part, ast.Constant) else "{}"
            for part in node.values
            if isinstance(part, ast.Constant | ast.FormattedValue)
        )
    if isinstance(node, ast.Call) and node.args:  # sa.text("...")
        return _string(node.args[0])
    return ""


def _first_string_arg(call: ast.Call) -> str:
    return _string(call.args[0]) if call.args else ""


def _created_tables(body: list[ast.stmt]) -> set[str]:
    created: set[str] = set()
    for node in ast.walk(ast.Module(body=body, type_ignores=[])):
        if isinstance(node, ast.Call) and _name(node.func) == "op.create_table":
            created.add(_first_string_arg(node))
    return created


def _column_problem(column: ast.expr) -> str | None:
    if not (isinstance(column, ast.Call) and _name(column.func).endswith("Column")):
        return None
    if (
        _is_false(_keyword(column, "nullable"))
        and _keyword(column, "server_default") is None
    ):
        return "adds a NOT NULL column without server_default (fails on existing rows, and the running release does not write it)"
    return None


def _call_problem(call: ast.Call, created: set[str]) -> str | None:
    name = _name(call.func)
    table = _first_string_arg(call)
    if name in {"op.drop_column", "op.drop_table", "op.rename_table"}:
        return f"{name.removeprefix('op.')} breaks the release still running; do it in a later release"
    if name == "op.alter_column":
        if table in created:
            return None
        if _keyword(call, "new_column_name") is not None:
            return "renames a column the running release still reads"
        if _keyword(call, "type_") is not None:
            return "changes a column type (rewrites and locks the table)"
        if _is_false(_keyword(call, "nullable")):
            return "makes an existing column NOT NULL (scans and locks the table); backfill and validate first"
        return None
    if name == "op.add_column" and table not in created:
        column = call.args[1] if len(call.args) > 1 else None
        return _column_problem(column) if column is not None else None
    if name == "op.create_index":
        table = _string(call.args[1]) if len(call.args) > 1 else ""
        table = table or _string(_keyword(call, "table_name"))
        if table in created or _is_true(_keyword(call, "postgresql_concurrently")):
            return None
        return "creates an index on an existing table without postgresql_concurrently=True (blocks writes)"
    if name == "op.execute":
        sql = _first_string_arg(call)
        if RISKY_SQL.search(sql):
            return "raw SQL drops, renames, retypes, locks or sets NOT NULL"
    return None


def check_source(source: str, path: str) -> list[Problem]:
    tree = ast.parse(source)
    lines = source.splitlines()
    upgrade = next(
        (
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "upgrade"
        ),
        None,
    )
    if upgrade is None:
        return []
    created = _created_tables(upgrade.body)
    problems: list[Problem] = []
    for node in ast.walk(upgrade):
        if not isinstance(node, ast.Call):
            continue
        message = _call_problem(node, created)
        if message is None:
            continue
        nearby = lines[max(node.lineno - 2, 0) : node.lineno]
        if any(WAIVER.search(line) for line in nearby):
            continue
        problems.append(Problem(path, node.lineno, message))
    return problems


def _relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def test_new_migrations_are_safe_for_a_rolling_release() -> None:
    baseline = set(json.loads(BASELINE.read_text()))
    problems = [
        problem
        for path in migration_files()
        if _relative(path) not in baseline
        for problem in check_source(path.read_text(), _relative(path))
    ]
    assert problems == [], (
        "Unsafe migration operations (release runbook: keep migrations additive). "
        "Split the change across releases, or add '# migration-safety: <reason>' "
        "after review:\n" + "\n".join(map(str, problems))
    )


def test_baseline_lists_only_existing_files() -> None:
    existing = {_relative(path) for path in migration_files()}
    stale = set(json.loads(BASELINE.read_text())) - existing
    assert not stale, f"Remove deleted migrations from the baseline: {sorted(stale)}"


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ('op.drop_column("users", "age")', "drop_column"),
        ('op.drop_table("users")', "drop_table"),
        ('op.rename_table("a", "b")', "rename_table"),
        ('op.alter_column("users", "age", type_=sa.Text())', "column type"),
        ('op.alter_column("users", "age", new_column_name="years")', "renames"),
        ('op.alter_column("users", "age", nullable=False)', "NOT NULL"),
        (
            'op.add_column("users", sa.Column("age", sa.Integer(), nullable=False))',
            "server_default",
        ),
        ('op.create_index("ix_age", "users", ["age"])', "concurrently"),
        ('op.execute("ALTER TABLE users DROP COLUMN age")', "raw SQL"),
        ('op.execute(sa.text("LOCK TABLE users"))', "raw SQL"),
        ('op.execute("ALTER TABLE users ALTER COLUMN age TYPE text")', "raw SQL"),
    ],
)
def test_unsafe_operations_are_reported(body: str, expected: str) -> None:
    source = f"def upgrade():\n    {body}\n"
    [problem] = check_source(source, "x.py")
    assert expected in problem.message


@pytest.mark.parametrize(
    "body",
    [
        'op.add_column("users", sa.Column("age", sa.Integer(), nullable=True))',
        'op.add_column("users", sa.Column("age", sa.Integer(), nullable=False, server_default="0"))',
        'op.create_index("ix_age", "users", ["age"], postgresql_concurrently=True)',
        'op.execute("UPDATE users SET age = 1")',
        'op.alter_column("users", "age", comment="years")',
        # Waived after review, on the line or the line above.
        'op.drop_column("users", "age")  # migration-safety: column unused since v1.0.2',
    ],
)
def test_safe_or_waived_operations_pass(body: str) -> None:
    assert check_source(f"def upgrade():\n    {body}\n", "x.py") == []


def test_tables_created_in_the_same_migration_are_free_to_shape() -> None:
    source = """
def upgrade():
    op.create_table("notes", sa.Column("id", sa.Integer()))
    op.add_column("notes", sa.Column("body", sa.Text(), nullable=False))
    op.alter_column("notes", "body", type_=sa.String())
    op.create_index("ix_notes_body", "notes", ["body"])
"""
    assert check_source(source, "x.py") == []


def test_waiver_on_the_line_above_and_downgrade_is_ignored() -> None:
    source = """
def upgrade():
    # migration-safety: table emptied and unused since v1.0.4
    op.drop_table("old")


def downgrade():
    op.drop_table("anything")
"""
    assert check_source(source, "x.py") == []
