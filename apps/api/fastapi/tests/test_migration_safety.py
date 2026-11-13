"""New migrations must not lock or break a live table without a reviewed reason (#1249).

The release runbook keeps migrations additive: the previous release still runs
against the new schema while a deploy rolls, so a drop, a rename or a type change
waits for a later release. This checks only `upgrade()` of migrations added after
the baseline (`migration_safety_baseline.json`, every file that existed when the
check started); the files there are grandfathered.

A deliberate exception carries `# migration-safety: <why this is safe>` on the line
above the operation or anywhere within its call. The baseline can only shrink:
a listed file must predate the check (`grandfathered`).
"""

import ast
import json
import re
from dataclasses import dataclass
from datetime import date
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BASELINE = Path(__file__).with_name("migration_safety_baseline.json")
VERSION_DIRS = ("alembic/versions", "src/*/migrations/versions")
WAIVER = re.compile(r"#\s*migration-safety:\s*\S")
RISKY_SQL = re.compile(
    r"\b(DROP\s+(TABLE|COLUMN|CONSTRAINT|SCHEMA|INDEX(?!\s+CONCURRENTLY))"
    r"|ALTER\s+TABLE\s+\S+\s+(RENAME|ALTER\s+(COLUMN\s+)?\S+\s+(SET\s+DATA\s+)?TYPE)"
    r"|RENAME\s+(TO|COLUMN)|SET\s+NOT\s+NULL|LOCK\s+TABLE"
    r"|CREATE\s+(UNIQUE\s+)?INDEX(?!\s+CONCURRENTLY))\b",
    re.IGNORECASE,
)
# SQLAlchemy Core builders cannot express DDL, so executing one is data work.
CORE_BUILDERS = {"select", "insert", "update", "delete", "values", "union"}
DROPS = {"drop_column", "drop_table", "rename_table", "drop_constraint"}
LOCKING_ON_EXISTING = {"create_foreign_key", "create_unique_constraint"}
# Grandfathered files: main migrations dated up to the start of the check, and
# domain migrations up to their number then (the baseline can only shrink).
BASELINE_LAST_DATE = date(2026, 11, 11)
BASELINE_LAST_DOMAIN_NUMBER = {
    "eregister": 7,
    "janitorial": 2,
    "transport": 3,
    "wxproducts": 5,
    "wxwatch": 7,
}
MAIN_DATE = re.compile(r"^(\d{4})[-_](\d{2})[-_](\d{2})_")
DOMAIN_NUMBER = re.compile(r"^(\d{4})_")


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
    if isinstance(node, ast.Call):
        return f"{_name(node.func)}()"
    return ""


def _method(call: ast.Call) -> str:
    """`drop_column` for op.drop_column(...) and batch.drop_column(...)."""
    return call.func.attr if isinstance(call.func, ast.Attribute) else ""


def _keyword(call: ast.Call, name: str) -> ast.expr | None:
    return next((kw.value for kw in call.keywords if kw.arg == name), None)


def _is_false(node: ast.expr | None) -> bool:
    return isinstance(node, ast.Constant) and node.value is False


def _is_true(node: ast.expr | None) -> bool:
    return isinstance(node, ast.Constant) and node.value is True


def _literal(node: ast.expr | None) -> str:
    if isinstance(node, ast.Constant) and isinstance(node.value, str):
        return node.value
    return ""


class _Sql:
    """Resolve the SQL text of an execute() argument, or say it cannot."""

    def __init__(self, assignments: dict[str, ast.expr]) -> None:
        self.assignments = assignments

    def text(self, node: ast.expr | None, depth: int = 0) -> str | None:
        if node is None or depth > 5:
            return None
        if isinstance(node, ast.Constant):
            return node.value if isinstance(node.value, str) else None
        if isinstance(node, ast.JoinedStr):
            return "".join(
                part.value if isinstance(part, ast.Constant) else "{}"
                for part in node.values
                if isinstance(part, ast.Constant | ast.FormattedValue)
            )
        if isinstance(node, ast.BinOp) and isinstance(node.op, ast.Add | ast.Mod):
            left = self.text(node.left, depth + 1)
            right = self.text(node.right, depth + 1)
            if left is None:
                return None
            return left + (right or "{}")
        if isinstance(node, ast.Name) and node.id in self.assignments:
            return self.text(self.assignments[node.id], depth + 1)
        if isinstance(node, ast.Call):
            if isinstance(node.func, ast.Attribute) and node.func.attr in {
                "format",
                "bindparams",
                "columns",
            }:
                return self.text(node.func.value, depth + 1)
            if _name(node.func).split(".")[-1] == "text" and node.args:
                return self.text(node.args[0], depth + 1)
        return None

    def is_core_query(self, node: ast.expr | None) -> bool:
        while isinstance(node, ast.Call | ast.Attribute):
            if isinstance(node, ast.Call):
                head = _name(node.func).split(".")[-1].removesuffix("()")
                if head in CORE_BUILDERS:
                    return True
                node = node.func
            else:
                if node.attr in CORE_BUILDERS:
                    return True
                node = node.value
        if isinstance(node, ast.Name) and node.id in self.assignments:
            return self.is_core_query(self.assignments[node.id])
        return False


def _target(call: ast.Call, position: int, keyword: str) -> str:
    if len(call.args) > position:
        return _literal(call.args[position])
    return _literal(_keyword(call, keyword))


def _created_tables(body: list[ast.stmt]) -> set[str]:
    return {
        _target(node, 0, "table_name")
        for node in ast.walk(ast.Module(body=body, type_ignores=[]))
        if isinstance(node, ast.Call) and _method(node) == "create_table"
    }


def _batch_tables(body: list[ast.stmt]) -> dict[str, str]:
    """`with op.batch_alter_table("t") as batch:` maps batch -> t."""
    tables: dict[str, str] = {}
    for node in ast.walk(ast.Module(body=body, type_ignores=[])):
        if isinstance(node, ast.With):
            for item in node.items:
                call = item.context_expr
                if (
                    isinstance(call, ast.Call)
                    and _method(call) == "batch_alter_table"
                    and isinstance(item.optional_vars, ast.Name)
                ):
                    tables[item.optional_vars.id] = _target(call, 0, "table_name")
    return tables


def _assignments(body: list[ast.stmt]) -> dict[str, ast.expr]:
    found: dict[str, ast.expr] = {}
    for node in ast.walk(ast.Module(body=body, type_ignores=[])):
        if (
            isinstance(node, ast.Assign)
            and len(node.targets) == 1
            and isinstance(node.targets[0], ast.Name)
        ):
            found[node.targets[0].id] = node.value
    return found


def _column_problem(column: ast.expr) -> str | None:
    if not (isinstance(column, ast.Call) and _name(column.func).endswith("Column")):
        return None
    if (
        _is_false(_keyword(column, "nullable"))
        and _keyword(column, "server_default") is None
    ):
        return "adds a NOT NULL column without server_default (fails on existing rows, and the running release does not write it)"
    return None


def _call_problem(
    call: ast.Call, created: set[str], batches: dict[str, str], sql: _Sql
) -> str | None:
    method = _method(call)
    receiver = call.func.value if isinstance(call.func, ast.Attribute) else None
    batch = receiver.id if isinstance(receiver, ast.Name) else ""
    in_batch = batch in batches
    # Batch operations omit the table: it is the batch's.
    shift = 0 if in_batch else 1
    table = batches[batch] if in_batch else _target(call, 0, "table_name")
    if method in DROPS:
        if method == "drop_constraint" and table in created:
            return None
        return f"{method} breaks the release still running; do it in a later release"
    if method == "alter_column":
        if table in created:
            return None
        if _keyword(call, "new_column_name") is not None:
            return "renames a column the running release still reads"
        if _keyword(call, "type_") is not None:
            return "changes a column type (rewrites and locks the table)"
        if _is_false(_keyword(call, "nullable")):
            return "makes an existing column NOT NULL (scans and locks the table); backfill and validate first"
        return None
    if method == "add_column" and table not in created:
        column = (
            call.args[shift] if len(call.args) > shift else _keyword(call, "column")
        )
        return _column_problem(column) if column is not None else None
    if method == "create_index":
        index_table = table if in_batch else _target(call, 1, "table_name")
        if index_table in created or _is_true(
            _keyword(call, "postgresql_concurrently")
        ):
            return None
        return "creates an index on an existing table without postgresql_concurrently=True (blocks writes)"
    if method in LOCKING_ON_EXISTING:
        source_table = (
            table
            if in_batch
            else _target(
                call,
                1,
                "source_table" if method == "create_foreign_key" else "table_name",
            )
        )
        if source_table in created:
            return None
        return f"{method} on an existing table takes a lock and validates every row; add it NOT VALID and validate in a later release"
    if method == "execute":
        argument = call.args[0] if call.args else None
        text = sql.text(argument)
        if text is None:
            if sql.is_core_query(argument):
                return None
            return "executes SQL the check cannot read; keep it a literal, or waive it after review"
        if RISKY_SQL.search(text):
            return "raw SQL drops, renames, retypes, locks, sets NOT NULL or builds an index without CONCURRENTLY"
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
    batches = _batch_tables(upgrade.body)
    sql = _Sql(_assignments(upgrade.body))
    problems: list[Problem] = []
    for node in ast.walk(upgrade):
        if not isinstance(node, ast.Call):
            continue
        message = _call_problem(node, created, batches, sql)
        if message is None:
            continue
        # The waiver may sit on the line above or anywhere in the call.
        span = lines[max(node.lineno - 2, 0) : node.end_lineno or node.lineno]
        if any(WAIVER.search(line) for line in span):
            continue
        problems.append(Problem(path, node.lineno, message))
    return problems


def grandfathered(relative: str) -> bool:
    """Whether a file may be in the baseline: it predates the check."""
    name = Path(relative).name
    if relative.startswith("alembic/"):
        match = MAIN_DATE.match(name)
        return bool(match) and date(*map(int, match.groups())) <= BASELINE_LAST_DATE
    domain = relative.split("/")[1]
    match = DOMAIN_NUMBER.match(name)
    return bool(match) and int(match.group(1)) <= BASELINE_LAST_DOMAIN_NUMBER.get(
        domain, -1
    )


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


def test_baseline_lists_only_existing_files_that_predate_the_check() -> None:
    existing = {_relative(path) for path in migration_files()}
    baseline = set(json.loads(BASELINE.read_text()))
    stale = baseline - existing
    assert not stale, f"Remove deleted migrations from the baseline: {sorted(stale)}"
    # The baseline only shrinks: a new migration cannot be exempted by listing it.
    newer = sorted(path for path in baseline if not grandfathered(path))
    assert not newer, f"Only migrations that predate the check are exempt: {newer}"


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
        ('op.execute("ALTER TABLE users ALTER age TYPE text")', "raw SQL"),
        ('op.execute("CREATE UNIQUE INDEX ix ON users (age)")', "raw SQL"),
        ('op.execute("ALTER TABLE users DROP CONSTRAINT fk")', "raw SQL"),
        ('op.get_bind().execute(sa.text("DROP TABLE users"))', "raw SQL"),
        ('op.execute("ALTER TABLE users " + "DROP COLUMN age")', "raw SQL"),
        ("op.execute(build_sql())", "cannot read"),
        ('op.drop_constraint("fk_users", "users")', "drop_constraint"),
        ('op.create_foreign_key("fk", "users", "orgs", ["org"], ["id"])', "NOT VALID"),
        ('op.create_unique_constraint("uq", "users", ["email"])', "NOT VALID"),
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
        'op.execute("CREATE INDEX CONCURRENTLY ix ON users (age)")',
        "op.get_bind().execute(sa.select(users).limit(1))",
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


def test_sql_held_in_a_variable_is_read() -> None:
    source = """
def upgrade():
    statement = "ALTER TABLE users DROP COLUMN age"
    op.execute(sa.text(statement))
"""
    [problem] = check_source(source, "x.py")
    assert "raw SQL" in problem.message


def test_batch_operations_are_checked_on_the_batch_table() -> None:
    source = """
def upgrade():
    with op.batch_alter_table("users") as batch:
        batch.drop_column("age")
        batch.alter_column("name", type_=sa.Text())
"""
    assert [p.message.split(" ")[0] for p in check_source(source, "x.py")] == [
        "drop_column",
        "changes",
    ]


def test_a_waiver_inside_a_multi_line_call_counts() -> None:
    source = """
def upgrade():
    op.drop_column(
        "users",
        "age",  # migration-safety: unused since v1.0.2, removed after release
    )
"""
    assert check_source(source, "x.py") == []


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("alembic/versions/2026-11-11_x.py", True),
        ("alembic/versions/2026_06_02_x.py", True),
        ("alembic/versions/2026-11-12_x.py", False),
        ("src/wxproducts/migrations/versions/0005_x.py", True),
        ("src/wxproducts/migrations/versions/0006_x.py", False),
        ("src/newdomain/migrations/versions/0001_x.py", False),
    ],
)
def test_only_migrations_that_predate_the_check_can_be_grandfathered(
    path: str, expected: bool
) -> None:
    assert grandfathered(path) is expected
