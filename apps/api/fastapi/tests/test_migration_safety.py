"""New migrations must not lock or break a live table without a reviewed reason (#1249).

The release runbook keeps migrations additive: the previous release still runs
against the new schema while a deploy rolls. This checks `upgrade()` of every
migration not listed as grandfathered in `migration_safety_baseline.json`. The
baseline freezes the migrations on origin/dev when the expand-then-contract rule
landed (#1147). Only frozen files may be grandfathered, and a new migration is
checked, never exempted.

A locking operation (non-concurrent index, constraint without NOT VALID) takes a
reviewed `# migration-safety: <why this is safe>` on its own line: a trailing comment
or a line inside the call. A comment on the line above does not count.

Destructive operations (drop, rename, type change, NOT NULL on an existing column,
TRUNCATE, and raw SQL doing these) cannot be waived. They need a contract step: a
module-level `CONTRACT = {"expand_revision": "<rev>", "contract_after": "YYYY-MM-DD"}`
whose expand revision is an ancestor in this migration's `down_revision` chain,
dated at least 7 days before `contract_after` (the expand's filename date). The
migration itself must be dated on or after `contract_after`. A marker allows
destructive operations on ANY table in the file, so the reviewer checks each one.

A call the check cannot read (unreadable SQL, a module-level helper) needs the
CONTRACT marker or `# migration-safety: no destructive ops` after review.
"""

import ast
import functools
import hashlib
import json
import re
from collections.abc import Mapping
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
BASELINE = Path(__file__).with_name("migration_safety_baseline.json")
# sha256 of the sorted "frozen" list: changing it is a deliberate, reviewed act.
FROZEN_SHA256 = "c904dd0c0b30c1729e18d673ca38fad728042c92517babf04d08a06832b5419a"
VERSION_DIRS = ("alembic/versions", "src/*/migrations/versions")
WAIVER = re.compile(r"#\s*migration-safety:\s*\S")
OPAQUE_WAIVER = re.compile(r"#\s*migration-safety:\s*no destructive ops\b")
# Deletes, renames, truncates or retypes data: only in a contract step.
DESTRUCTIVE_SQL = re.compile(
    r"\b(DROP|TRUNCATE|RENAME|SET\s+NOT\s+NULL)\b"
    r"|\bALTER\s+(COLUMN\s+)?\S+\s+(SET\s+DATA\s+)?TYPE\b",
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
    "expand migration>', 'contract_after': 'YYYY-MM-DD'} (at least 7 days after the "
    "expand, and this file dated on or after contract_after)"
)
OPAQUE_MESSAGE = (
    "cannot read what this call does (unreadable SQL or a module-level helper); "
    "add a CONTRACT marker, or '# migration-safety: no destructive ops' after review"
)
MAIN_DATE = re.compile(r"^(\d{4})[-_](\d{2})[-_](\d{2})_")


@dataclass(frozen=True)
class Problem:
    path: str
    line: int
    message: str

    def __str__(self) -> str:
        return f"{self.path}:{self.line}: {self.message}"


@dataclass(frozen=True)
class Revision:
    """A revision of one history: its filename date, its parents, and whether the
    history is the main one (whose files must all carry a date prefix)."""

    merged: date | None
    parents: tuple[str, ...]
    main: bool = False


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


def _key(schema: str, name: str) -> str:
    """A table's identity, schema-qualified; empty when its name cannot be read."""
    return f"{schema}.{name}" if name else ""


def _table(call: ast.Call, batches: dict[str, str], position: int = 0) -> str:
    """The table an operation acts on: a batch's table, else its table argument."""
    receiver = call.func.value if isinstance(call.func, ast.Attribute) else None
    if isinstance(receiver, ast.Name) and receiver.id in batches:
        return batches[receiver.id]
    schema = _literal(_keyword(call, "schema"))
    return _key(schema, _target(call, position, "table_name"))


def _created_tables(body: list[ast.stmt]) -> set[str]:
    """Tables this migration creates. A name it cannot read creates nothing."""
    created = {
        _table(node, {})
        for node in ast.walk(ast.Module(body=body, type_ignores=[]))
        if isinstance(node, ast.Call) and _method(node) == "create_table"
    }
    created.discard("")
    return created


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
                    tables[item.optional_vars.id] = _table(call, {})
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


def _helpers(tree: ast.Module) -> set[str]:
    """Module-level functions other than upgrade/downgrade: calls the check cannot read."""
    return {node.name for node in tree.body if isinstance(node, ast.FunctionDef)} - {
        "upgrade",
        "downgrade",
    }


def _opaque(call: ast.Call, sql: _Sql, helpers: set[str]) -> bool:
    """A call whose effect the check cannot read: a helper, or SQL it cannot resolve."""
    if isinstance(call.func, ast.Name) and call.func.id in helpers:
        return True
    if _method(call) == "execute":
        argument = call.args[0] if call.args else None
        return sql.text(argument) is None and not sql.is_core_query(argument)
    return False


def _destructive(
    call: ast.Call, created: set[str], batches: dict[str, str], sql: _Sql
) -> str | None:
    """An operation that deletes, renames, truncates or retypes data: a contract step."""
    method = _method(call)
    # drop_constraint(name, table) and drop_index(name, table) put the table second.
    position = 1 if method in {"drop_constraint", "drop_index"} else 0
    table = _table(call, batches, position)
    if method in DROPS:
        if table in created:
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
            return "raw SQL drops, renames, truncates, retypes or sets NOT NULL"
    return None


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
    table = _table(call, batches)
    if method == "add_column" and table not in created:
        column = (
            call.args[shift] if len(call.args) > shift else _keyword(call, "column")
        )
        return _column_problem(column) if column is not None else None
    if method == "create_index":
        index_table = table if in_batch else _table(call, batches, 1)
        if index_table in created or _is_true(
            _keyword(call, "postgresql_concurrently")
        ):
            return None
        return "creates an index on an existing table without postgresql_concurrently=True (blocks writes)"
    if method in LOCKING_ON_EXISTING:
        source_table = table if in_batch else _table(call, batches, 1)
        if source_table in created:
            return None
        return f"{method} on an existing table takes a lock and validates every row; add it NOT VALID and validate in a later release"
    if method == "execute":
        text = sql.text(call.args[0] if call.args else None)
        if text is not None and LOCKING_SQL.search(text):
            return "raw SQL locks a table or builds an index without CONCURRENTLY"
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


def _header(tree: ast.Module) -> tuple[str | None, tuple[str, ...]]:
    """The module-level `revision` and `down_revision` of a migration."""
    values: dict[str, ast.expr] = {}
    for node in tree.body:
        if isinstance(node, ast.Assign):
            for target in node.targets:
                if isinstance(target, ast.Name):
                    values[target.id] = node.value
    revision = _literal(values.get("revision")) or None
    try:
        parents = (
            ast.literal_eval(values["down_revision"])
            if "down_revision" in values
            else None
        )
    except ValueError:
        parents = None
    if isinstance(parents, str):
        return revision, (parents,)
    if isinstance(parents, list | tuple):
        return revision, tuple(p for p in parents if isinstance(p, str))
    return revision, ()


def _filename_date(path: str | Path) -> date | None:
    match = MAIN_DATE.match(Path(path).name)
    return date(*map(int, match.groups())) if match else None


def _ancestors(parents: tuple[str, ...], history: Mapping[str, Revision]) -> set[str]:
    """Every revision reachable from the parents through down_revision."""
    seen: set[str] = set()
    pending = list(parents)
    while pending:
        revision = pending.pop()
        if revision in seen or revision not in history:
            continue
        seen.add(revision)
        pending.extend(history[revision].parents)
    return seen


def _contract_problems(
    value: ast.expr,
    path: str,
    history: Mapping[str, Revision],
    parents: tuple[str, ...],
) -> list[Problem]:
    """A CONTRACT marker names an earlier revision in this chain and an early enough date."""
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
    if not isinstance(expand, str) or expand not in _ancestors(parents, history):
        return [
            Problem(
                path,
                line,
                f"CONTRACT expand_revision {expand!r} is not an earlier revision in this migration's chain",
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
    revision = history[expand]
    if revision.merged is None and revision.main:
        return [
            Problem(
                path,
                line,
                f"CONTRACT expand_revision {expand!r} has no date in its filename; main migrations are dated YYYY-MM-DD_",
            )
        ]
    merged = revision.merged
    if merged is not None and after < merged + timedelta(days=7):
        return [
            Problem(
                path,
                line,
                f"CONTRACT contract_after {after} is less than 7 days after the expand migration ({merged})",
            )
        ]
    own = _filename_date(path)
    if own is not None and own < after:
        return [
            Problem(
                path,
                line,
                f"CONTRACT contract_after {after} is later than this migration's date {own}; the contract must not run before it",
            )
        ]
    return []


def _in_main_history(directory: Path) -> bool:
    """alembic/versions is the main history; domain histories are numbered."""
    return directory.name == "versions" and directory.parent.name == "alembic"


@functools.cache
def _history(directory: Path) -> dict[str, Revision]:
    """Every revision of one migration history, read from the files in its directory."""
    main = _in_main_history(directory)
    history: dict[str, Revision] = {}
    for path in sorted(directory.glob("*.py")):
        revision, parents = _header(ast.parse(path.read_text()))
        if revision is not None:
            history[revision] = Revision(_filename_date(path), parents, main)
    return history


def _waived(node: ast.Call, lines: list[str], pattern: re.Pattern[str]) -> bool:
    # The waiver sits on the call's own lines: a trailing comment or a line inside it.
    span = lines[node.lineno - 1 : node.end_lineno or node.lineno]
    return any(pattern.search(line) for line in span)


def check_source(
    source: str, path: str, history: Mapping[str, Revision] | None = None
) -> list[Problem]:
    tree = ast.parse(source)
    lines = source.splitlines()
    problems: list[Problem] = []
    if _in_main_history(Path(path).parent) and _filename_date(path) is None:
        problems.append(
            Problem(
                path,
                1,
                "main migrations need a YYYY-MM-DD_ filename prefix (alembic.ini file_template)",
            )
        )
    upgrade = next(
        (
            node
            for node in tree.body
            if isinstance(node, ast.FunctionDef) and node.name == "upgrade"
        ),
        None,
    )
    if upgrade is None:
        return problems
    created = _created_tables(upgrade.body)
    batches = _batch_tables(upgrade.body)
    sql = _Sql(_assignments(upgrade.body))
    helpers = _helpers(tree)
    contract = _contract(tree)
    _, parents = _header(tree)
    if contract is not None:
        problems.extend(_contract_problems(contract, path, history or {}, parents))
    for node in ast.walk(upgrade):
        if not isinstance(node, ast.Call):
            continue
        if _opaque(node, sql, helpers):
            if contract is None and not _waived(node, lines, OPAQUE_WAIVER):
                problems.append(Problem(path, node.lineno, OPAQUE_MESSAGE))
            continue
        destructive = _destructive(node, created, batches, sql)
        if destructive is not None:
            # A waiver never exempts these. With a CONTRACT marker the file is a
            # contract step, and the marker was checked above.
            if contract is None:
                problems.append(
                    Problem(path, node.lineno, f"{destructive}; {CONTRACT_HINT}")
                )
            continue
        message = _call_problem(node, created, batches, sql)
        if message is None or _waived(node, lines, WAIVER):
            continue
        problems.append(Problem(path, node.lineno, message))
    return problems


def _relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def _baseline() -> dict[str, list[str]]:
    return json.loads(BASELINE.read_text())


def test_new_migrations_are_safe_for_a_rolling_release() -> None:
    grandfathered = set(_baseline()["grandfathered"])
    problems = [
        problem
        for path in migration_files()
        if _relative(path) not in grandfathered
        for problem in check_source(
            path.read_text(), _relative(path), _history(path.parent)
        )
    ]
    assert problems == [], (
        "Unsafe migration operations (release runbook: keep migrations additive). "
        "Split the change across releases, add a CONTRACT step for a destructive "
        "one, or add '# migration-safety: <reason>' after review:\n"
        + "\n".join(map(str, problems))
    )


# Both were on origin/dev before the rule and are grandfathered on purpose:
# - 2026-11-13_index_names: SET NOT NULL, and drops of its own temporary CHECK and
#   of an invalid index: the validate-then-set pattern for an existing column.
# - 2026-11-13_profile_image_cascade: calls the module-level helper _replace().
def test_baseline_is_frozen_to_the_migrations_on_origin_dev() -> None:
    frozen = _baseline()["frozen"]
    digest = hashlib.sha256("\n".join(sorted(frozen)).encode()).hexdigest()
    assert digest == FROZEN_SHA256, (
        "The frozen list changed. It pins the migrations on origin/dev (#1147) and "
        "must not grow: a later migration is checked, never grandfathered."
    )
    extra = sorted(set(_baseline()["grandfathered"]) - set(frozen))
    assert not extra, f"Only frozen migrations may be grandfathered: {extra}"


def test_baseline_lists_only_existing_files() -> None:
    existing = {_relative(path) for path in migration_files()}
    stale = set(_baseline()["grandfathered"]) - existing
    assert not stale, f"Remove deleted migrations from the baseline: {sorted(stale)}"


@pytest.mark.parametrize(
    ("body", "expected"),
    [
        ('op.drop_column("users", "age")', "drop_column"),
        ('op.drop_table("users")', "drop_table"),
        ('op.rename_table("a", "b")', "rename_table"),
        ('op.drop_index("ix_age", table_name="users")', "drop_index"),
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
        ('op.execute("TRUNCATE users")', "raw SQL"),
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


def test_drops_on_a_table_created_in_the_same_migration_are_free() -> None:
    source = """
def upgrade():
    op.create_table("notes", sa.Column("id", sa.Integer()), sa.Column("body", sa.Text()))
    op.create_index("ix_notes_body", "notes", ["body"])
    op.drop_index("ix_notes_body", table_name="notes")
    op.drop_constraint("uq_notes", "notes")
    op.drop_column("notes", "body")
"""
    assert check_source(source, "x.py") == []


def test_a_waiver_on_the_line_above_does_not_cover_the_next_call() -> None:
    source = """
def upgrade():
    # migration-safety: table is empty and only read by the old release
    op.create_index("ix_old_x", "old", ["x"])


def downgrade():
    op.drop_table("anything")
"""
    [problem] = check_source(source, "x.py")
    assert "concurrently" in problem.message


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


def test_sql_held_in_a_variable_is_read() -> None:
    source = """
def upgrade():
    statement = "ALTER TABLE users DROP COLUMN age"
    op.execute(sa.text(statement))
"""
    [problem] = check_source(source, "x.py")
    assert "raw SQL" in problem.message


# Expand, then contract (#1147). A destructive op is only allowed in a contract
# migration that names an ancestor revision and is dated after it.
HISTORY: dict[str, Revision] = {
    "abc123": Revision(date(2026, 11, 20), ()),
    "side1": Revision(date(2026, 11, 19), ()),
    "eregister_0007": Revision(None, ()),
}
MARKER = 'CONTRACT = {"expand_revision": "abc123", "contract_after": "2026-12-01"}'
HELPER = "def _backfill():\n    pass\n"


def _upgrade(*lines: str, marker: str = "", down_revision: str = "abc123") -> str:
    body = "\n".join(f"    {line}" for line in lines)
    header = f'revision = "contract1"\ndown_revision = "{down_revision}"'
    return f"{marker}\n{header}\n\n\ndef upgrade():\n{body}\n"


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


def test_marker_naming_a_revision_off_the_chain_fails() -> None:
    marker = 'CONTRACT = {"expand_revision": "side1", "contract_after": "2026-12-01"}'
    source = _upgrade('op.drop_column("users", "age")', marker=marker)
    [problem] = check_source(source, "x.py", HISTORY)
    assert "earlier revision in this migration's chain" in problem.message


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


def test_contract_file_dated_before_its_contract_after_fails() -> None:
    marker = 'CONTRACT = {"expand_revision": "abc123", "contract_after": "2026-11-27"}'
    source = _upgrade('op.drop_column("users", "age")', marker=marker)
    [problem] = check_source(source, "alembic/versions/2026-11-21_contract.py", HISTORY)
    assert "later than" in problem.message


def test_contract_file_dated_on_its_contract_after_passes() -> None:
    marker = 'CONTRACT = {"expand_revision": "abc123", "contract_after": "2026-11-27"}'
    source = _upgrade('op.drop_column("users", "age")', marker=marker)
    assert (
        check_source(source, "alembic/versions/2026-11-27_contract.py", HISTORY) == []
    )


def test_numbered_domain_history_has_no_merge_date_to_check() -> None:
    marker = 'CONTRACT = {"expand_revision": "eregister_0007", "contract_after": "2026-12-01"}'
    source = _upgrade(
        'op.drop_column("readings", "old")',
        marker=marker,
        down_revision="eregister_0007",
    )
    assert check_source(source, "x.py", HISTORY) == []


EXPAND_FILE = """revision = "exp1"
down_revision = None


def upgrade():
    op.add_column("users", sa.Column("nick", sa.Text(), nullable=True))
"""


def _contract_file(contract_after: str) -> str:
    return f"""CONTRACT = {{"expand_revision": "exp1", "contract_after": "{contract_after}"}}
revision = "con1"
down_revision = "exp1"


def upgrade():
    op.drop_column("users", "age")
"""


def _versions(root: Path) -> Path:
    versions = root / "alembic" / "versions"
    versions.mkdir(parents=True)
    return versions


def test_a_real_history_is_read_from_its_files(tmp_path: Path) -> None:
    versions = _versions(tmp_path)
    (versions / "2026-11-20_expand.py").write_text(EXPAND_FILE)
    contract = versions / "2026-11-27_contract.py"
    contract.write_text(_contract_file("2026-11-27"))
    history = _history(versions)
    assert history["exp1"] == Revision(date(2026, 11, 20), (), main=True)
    assert history["con1"] == Revision(date(2026, 11, 27), ("exp1",), main=True)
    assert check_source(contract.read_text(), contract.as_posix(), history) == []


def test_a_real_contract_file_dated_too_early_fails(tmp_path: Path) -> None:
    versions = _versions(tmp_path)
    (versions / "2026-11-20_expand.py").write_text(EXPAND_FILE)
    contract = versions / "2026-11-21_contract.py"
    contract.write_text(_contract_file("2026-11-27"))
    problems = check_source(
        contract.read_text(), contract.as_posix(), _history(versions)
    )
    assert any("later than" in problem.message for problem in problems)


def test_a_main_expand_without_a_date_fails_the_contract_check(tmp_path: Path) -> None:
    versions = _versions(tmp_path)
    (versions / "expand.py").write_text(EXPAND_FILE)
    contract = versions / "2026-11-27_contract.py"
    contract.write_text(_contract_file("2026-11-27"))
    problems = check_source(
        contract.read_text(), contract.as_posix(), _history(versions)
    )
    assert any("has no date" in problem.message for problem in problems)


def test_every_main_migration_has_a_date_prefix() -> None:
    undated = [
        path.name
        for path in migration_files()
        if _in_main_history(path.parent) and _filename_date(path) is None
    ]
    assert undated == [], f"Main migrations need a YYYY-MM-DD_ prefix: {undated}"


def test_an_undated_main_file_is_a_problem() -> None:
    [problem] = check_source(
        "def upgrade():\n    pass\n", "alembic/versions/undated.py"
    )
    assert "YYYY-MM-DD_" in problem.message


def test_a_table_name_that_cannot_be_read_is_not_a_new_table() -> None:
    source = """
def upgrade():
    op.create_table(NAME, sa.Column("id", sa.Integer()))
    for table in ("a", "b"):
        op.drop_table(table)
"""
    problems = check_source(source, "x.py")
    assert [problem.message.split()[0] for problem in problems] == ["drop_table"]


def test_a_table_in_another_schema_is_not_the_same_table() -> None:
    source = """
def upgrade():
    op.create_table("notes", sa.Column("id", sa.Integer()), schema="hr")
    op.drop_column("notes", "body")
    op.drop_column("notes", "body", schema="hr")
"""
    assert [problem.line for problem in check_source(source, "x.py")] == [4]


def test_every_grandfathered_file_still_fails_the_check() -> None:
    for relative in _baseline()["grandfathered"]:
        path = ROOT / relative
        problems = check_source(path.read_text(), relative, _history(path.parent))
        assert problems, f"{relative} passes now: remove it from the baseline"


@pytest.mark.parametrize(
    "body",
    [
        'op.rename_table("users", "people")',
        'op.alter_column("users", "age", new_column_name="years")',
        'op.execute("ALTER TABLE users RENAME COLUMN age TO years")',
        'op.execute("ALTER TABLE ONLY users RENAME TO people")',
        'op.execute("ALTER TABLE IF EXISTS users ALTER COLUMN age TYPE text")',
        'op.execute("ALTER TABLE users ALTER COLUMN age SET DATA TYPE text")',
        'op.execute("ALTER TABLE IF EXISTS ONLY users DROP age")',
        'op.execute("TRUNCATE users")',
        'op.execute("DROP VIEW v")',
        'op.execute("DROP MATERIALIZED VIEW mv")',
        'op.execute("DROP TRIGGER t ON users")',
        'op.execute("DROP FUNCTION f()")',
        'op.execute("DROP SEQUENCE s")',
        'op.execute("DROP TYPE mood")',
    ],
)
def test_destructive_operations_need_a_contract_step(body: str) -> None:
    [problem] = check_source(_upgrade(body), "x.py", HISTORY)
    assert problem.message.startswith(("raw SQL", "alter_column", "rename_table"))
    assert check_source(_upgrade(body, marker=MARKER), "x.py", HISTORY) == []


def test_renames_are_detected_and_need_a_contract_step() -> None:
    [problem] = check_source(
        _upgrade('op.rename_table("users", "people")'), "x.py", HISTORY
    )
    assert "renames" in problem.message


def test_a_waiver_does_not_exempt_a_destructive_operation() -> None:
    source = _upgrade(
        'op.drop_column("users", "age")  # migration-safety: unused since v1.0.2'
    )
    [problem] = check_source(source, "x.py", HISTORY)
    assert "CONTRACT" in problem.message


@pytest.mark.parametrize("body", ["op.execute(build_sql())", "_backfill()"])
def test_unreadable_calls_need_a_marker_or_the_no_destructive_ops_waiver(
    body: str,
) -> None:
    module = f"{HELPER}\n\ndef upgrade():\n    {body}\n"
    [problem] = check_source(module, "x.py", HISTORY)
    assert "cannot read" in problem.message
    waived = f"{HELPER}\n\ndef upgrade():\n    {body}  # migration-safety: no destructive ops\n"
    assert check_source(waived, "x.py", HISTORY) == []
    # A general waiver does not cover an unreadable call.
    general = (
        f"{HELPER}\n\ndef upgrade():\n    # migration-safety: reviewed\n    {body}\n"
    )
    assert len(check_source(general, "x.py", HISTORY)) == 1
    assert (
        check_source(f"{HELPER}\n{_upgrade(body, marker=MARKER)}", "x.py", HISTORY)
        == []
    )
