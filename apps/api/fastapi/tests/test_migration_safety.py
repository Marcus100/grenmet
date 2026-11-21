"""New migrations must not lock or break a live table without a reviewed reason (#1249).

The release runbook keeps migrations additive: the previous release still runs
against the new schema while a deploy rolls, so a drop, a rename or a type change
waits for a later release. This checks only `upgrade()` of migrations added after
the baseline (`migration_safety_baseline.json`, every file that existed when the
check started); the files there are grandfathered.

A deliberate exception carries `# migration-safety: <why this is safe>` on the line
above the operation or anywhere within its call. The baseline can only shrink:
a listed file must predate the check (`grandfathered`).

Destructive operations (drop, rename, type change, NOT NULL on an existing
column) cannot be waived. They belong in a contract migration with a module-level
`CONTRACT = {"expand_revision": "<revision>", "contract_after": "YYYY-MM-DD"}`
naming an earlier expand migration in the same history, dated at least 7 days
after it (the expand's filename date; numbered domain migrations have none).
"""

import ast
import functools
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BASELINE = Path(__file__).with_name("migration_safety_baseline.json")
VERSION_DIRS = ("alembic/versions", "src/*/migrations/versions")
WAIVER = re.compile(r"#\s*migration-safety:\s*\S")
# Deletes, renames or retypes data: only in a contract migration.
DESTRUCTIVE_SQL = re.compile(
    r"\b(DROP\s+(TABLE|COLUMN|CONSTRAINT|SCHEMA|INDEX)"
    r"|ALTER\s+TABLE\s+\S+\s+(RENAME|ALTER\s+(COLUMN\s+)?\S+\s+(SET\s+DATA\s+)?TYPE)"
    r"|RENAME\s+(TO|COLUMN)|SET\s+NOT\s+NULL)\b",
    re.IGNORECASE,
)
# Locks a live table or builds an index on it without deleting anything: waivable.
LOCKING_SQL = re.compile(
    r"\b(LOCK\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX(?!\s+CONCURRENTLY))\b",
    re.IGNORECASE,
)
# SQLAlchemy Core builders cannot express DDL, so executing one is data work.
CORE_BUILDERS = {"select", "insert", "update", "delete", "values", "union"}
DROPS = {"drop_column", "drop_table", "rename_table", "drop_constraint", "drop_index"}
LOCKING_ON_EXISTING = {"create_foreign_key", "create_unique_constraint"}
CONTRACT_HINT = (
    "add a contract step: CONTRACT = {'expand_revision': '<revision of an earlier "
    "expand migration>', 'contract_after': 'YYYY-MM-DD'} (at least 7 days after it)"
)
# Grandfathered files: main migrations dated up to the day before the expand-then-
# contract rule (#1147), and domain migrations up to their number then. The baseline
# may list only these; it lists the files that already break the rule.
BASELINE_LAST_DATE = date(2026, 11, 20)
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
        if LOCKING_SQL.search(text):
            return "raw SQL locks a table or builds an index without CONCURRENTLY"
    return None


def _table(call: ast.Call, batches: dict[str, str]) -> str:
    """The table an operation acts on: the batch's table, else its first argument."""
    receiver = call.func.value if isinstance(call.func, ast.Attribute) else None
    if isinstance(receiver, ast.Name) and receiver.id in batches:
        return batches[receiver.id]
    return _target(call, 0, "table_name")


def _destructive(
    call: ast.Call, created: set[str], batches: dict[str, str], sql: _Sql
) -> str | None:
    """An operation that deletes, renames or retypes data: a contract step only."""
    method = _method(call)
    table = _table(call, batches)
    if method in DROPS:
        if method == "drop_constraint" and table in created:
            return None
        return f"{method} deletes or renames data"
    if method == "alter_column" and table not in created:
        if _keyword(call, "new_column_name") is not None:
            return "alter_column renames a column the running release still reads"
        if _keyword(call, "type_") is not None:
            return "alter_column changes a column type (may lose data)"
        if _is_false(_keyword(call, "nullable")):
            return "alter_column makes an existing column NOT NULL (fails on existing NULLs)"
    if method == "execute":
        text = sql.text(call.args[0] if call.args else None)
        if text is not None and DESTRUCTIVE_SQL.search(text):
            return "raw SQL drops, renames, retypes or sets NOT NULL"
    return None


def _contract(tree: ast.Module) -> ast.expr | None:
    """The value of a module-level `CONTRACT = {...}`, when the migration has one."""
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "CONTRACT"
            for target in node.targets
        ):
            return node.value
    return None


def _contract_problems(
    value: ast.expr, path: str, history: Mapping[str, date | None]
) -> list[Problem]:
    """A CONTRACT marker must name a known expand revision and a date 7+ days later."""
    line = value.lineno
    try:
        marker = ast.literal_eval(value)
    except ValueError:
        marker = None
    if not isinstance(marker, dict):
        return [
            Problem(path, line, f"CONTRACT must be a dict literal; {CONTRACT_HINT}")
        ]
    expand = marker.get("expand_revision")
    if not isinstance(expand, str) or expand not in history:
        return [
            Problem(
                path,
                line,
                f"CONTRACT expand_revision {expand!r} is not a revision in this migration history",
            )
        ]
    after_text = marker.get("contract_after")
    try:
        after = date.fromisoformat(after_text) if isinstance(after_text, str) else None
    except ValueError:
        after = None
    if after is None:
        return [
            Problem(
                path,
                line,
                f"CONTRACT contract_after must be a YYYY-MM-DD date; {CONTRACT_HINT}",
            )
        ]
    merged = history[expand]
    if merged is not None and after < merged + timedelta(days=7):
        return [
            Problem(
                path,
                line,
                f"CONTRACT contract_after {after} is less than 7 days after the expand migration ({merged})",
            )
        ]
    return []


def _revision(path: Path) -> str | None:
    for node in ast.parse(path.read_text()).body:
        if isinstance(node, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "revision"
            for target in node.targets
        ):
            return _literal(node.value) or None
    return None


@functools.cache
def _history(directory: Path) -> dict[str, date | None]:
    """Revision ids of one migration history, each with its filename date if dated."""
    history: dict[str, date | None] = {}
    for path in sorted(directory.glob("*.py")):
        revision = _revision(path)
        if revision is None:
            continue
        match = MAIN_DATE.match(path.name)
        history[revision] = date(*map(int, match.groups())) if match else None
    return history


def check_source(
    source: str, path: str, history: Mapping[str, date | None] | None = None
) -> list[Problem]:
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
    contract = _contract(tree)
    problems: list[Problem] = []
    if contract is not None:
        problems.extend(_contract_problems(contract, path, history or {}))
    for node in ast.walk(upgrade):
        if not isinstance(node, ast.Call):
            continue
        destructive = _destructive(node, created, batches, sql)
        if destructive is not None:
            # A waiver never exempts these. With a CONTRACT marker the file is
            # a contract step, and the marker was checked above.
            if contract is None:
                problems.append(
                    Problem(path, node.lineno, f"{destructive}; {CONTRACT_HINT}")
                )
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
        for problem in check_source(
            path.read_text(), _relative(path), _history(path.parent)
        )
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
        # Waived after review, on the line or the line above (locking ops only:
        # destructive ops need a CONTRACT marker, see below).
        'op.create_index("ix_age", "users", ["age"])  # migration-safety: table is empty',
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
    # migration-safety: table is empty and only read by the old release
    op.create_index("ix_old_x", "old", ["x"])


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
        "alter_column",
    ]


def test_a_waiver_inside_a_multi_line_call_counts() -> None:
    source = """
def upgrade():
    op.create_foreign_key(
        "fk_users_org",
        "users",
        "orgs",
        ["org"],
        ["id"],  # migration-safety: users table is empty in every environment
    )
"""
    assert check_source(source, "x.py") == []


@pytest.mark.parametrize(
    ("path", "expected"),
    [
        ("alembic/versions/2026-11-11_x.py", True),
        ("alembic/versions/2026_06_02_x.py", True),
        ("alembic/versions/2026-11-20_x.py", True),
        ("alembic/versions/2026-11-21_x.py", False),
        ("src/wxproducts/migrations/versions/0005_x.py", True),
        ("src/wxproducts/migrations/versions/0006_x.py", False),
        ("src/newdomain/migrations/versions/0001_x.py", False),
    ],
)
def test_only_migrations_that_predate_the_check_can_be_grandfathered(
    path: str, expected: bool
) -> None:
    assert grandfathered(path) is expected


# Expand, then contract (#1147). A destructive op (drop, rename, type change,
# NOT NULL on an existing column) is only allowed in a contract migration that
# names its expand migration and comes at least 7 days after it.
HISTORY: dict[str, date | None] = {
    "abc123": date(2026, 11, 20),
    "eregister_0007": None,
}
MARKER = 'CONTRACT = {"expand_revision": "abc123", "contract_after": "2026-12-01"}'


def _upgrade(*lines: str, marker: str = "") -> str:
    body = "\n".join(f"    {line}" for line in lines)
    return f"{marker}\n\n\ndef upgrade():\n{body}\n"


def test_additive_migration_passes() -> None:
    source = _upgrade(
        'op.add_column("users", sa.Column("nick", sa.Text(), nullable=True))',
        'op.create_table("notes", sa.Column("id", sa.Integer()))',
        'op.create_index("ix_users_nick", "users", ["nick"], postgresql_concurrently=True)',
    )
    assert check_source(source, "x.py", HISTORY) == []


def test_drop_without_a_contract_marker_fails() -> None:
    source = _upgrade('op.drop_column("users", "age")')
    [problem] = check_source(source, "x.py", HISTORY)
    assert "drop_column" in problem.message
    assert "CONTRACT" in problem.message


def test_drop_with_a_valid_contract_marker_passes() -> None:
    source = _upgrade('op.drop_column("users", "age")', marker=MARKER)
    assert check_source(source, "x.py", HISTORY) == []


def test_marker_naming_an_unknown_revision_fails() -> None:
    marker = 'CONTRACT = {"expand_revision": "zzz999", "contract_after": "2026-12-01"}'
    source = _upgrade('op.drop_column("users", "age")', marker=marker)
    [problem] = check_source(source, "x.py", HISTORY)
    assert "zzz999" in problem.message


@pytest.mark.parametrize(
    "marker",
    [
        # Six days after the expand migration (2026-11-20): too early.
        'CONTRACT = {"expand_revision": "abc123", "contract_after": "2026-11-26"}',
        'CONTRACT = {"expand_revision": "abc123", "contract_after": "soon"}',
        'CONTRACT = {"expand_revision": "abc123"}',
    ],
)
def test_malformed_or_too_early_marker_fails(marker: str) -> None:
    source = _upgrade('op.drop_column("users", "age")', marker=marker)
    [problem] = check_source(source, "x.py", HISTORY)
    assert "CONTRACT" in problem.message


def test_marker_exactly_seven_days_after_the_expand_passes() -> None:
    marker = 'CONTRACT = {"expand_revision": "abc123", "contract_after": "2026-11-27"}'
    source = _upgrade('op.drop_column("users", "age")', marker=marker)
    assert check_source(source, "x.py", HISTORY) == []


def test_numbered_domain_history_has_no_merge_date_to_check() -> None:
    marker = 'CONTRACT = {"expand_revision": "eregister_0007", "contract_after": "2026-12-01"}'
    source = _upgrade('op.drop_column("readings", "old")', marker=marker)
    assert check_source(source, "x.py", HISTORY) == []


def test_a_waiver_does_not_exempt_a_destructive_operation() -> None:
    source = _upgrade(
        'op.drop_column("users", "age")  # migration-safety: unused since v1.0.2'
    )
    [problem] = check_source(source, "x.py", HISTORY)
    assert "CONTRACT" in problem.message


@pytest.mark.parametrize(
    "body",
    [
        'op.rename_table("users", "people")',
        'op.alter_column("users", "age", new_column_name="years")',
        'op.execute("ALTER TABLE users RENAME COLUMN age TO years")',
    ],
)
def test_renames_are_detected_and_need_a_contract_step(body: str) -> None:
    [problem] = check_source(_upgrade(body), "x.py", HISTORY)
    assert "renames" in problem.message
    assert check_source(_upgrade(body, marker=MARKER), "x.py", HISTORY) == []
