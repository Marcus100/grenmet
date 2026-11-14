"""Models and migrations agree (#1298).

The test database is built by ``alembic upgrade head`` (``tests/conftest.py``),
so comparing it with the models is ``alembic check`` with the same filter as
``alembic/env.py``. A model changed without a migration, or a migration without
the model, fails here instead of turning up later as a surprise in
``alembic revision --autogenerate``.
"""

import json
import subprocess
import sys
from pathlib import Path

from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext

from src.database import engine
from src.model_registry import extension_tables, import_all_models, object_filter
from src.orm import Base

API_ROOT = Path(__file__).parents[1]


def test_migrations_match_the_models(test_database: None) -> None:
    import_all_models()
    with engine.connect() as connection:
        skip = extension_tables(connection)
        context = MigrationContext.configure(
            connection,
            opts={
                "include_schemas": True,
                "compare_type": True,
                "include_object": object_filter(skip),
            },
        )
        diff = compare_metadata(context, Base.metadata)
    assert diff == [], (
        "models and migrations differ; write a migration (or fix the model):\n"
        + "\n".join(repr(op) for op in diff)
    )


def test_alembic_loads_every_table_the_app_maps() -> None:
    """A model module missing from the registry would make autogenerate drop
    its tables. Separate processes keep each import set honest."""

    def tables(code: str) -> set[str]:
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                code + "\nfrom src.orm import Base\n"
                "import json; print(json.dumps(sorted(Base.metadata.tables)))",
            ],
            capture_output=True,
            text=True,
            check=True,
            cwd=API_ROOT,
        )
        return set(json.loads(result.stdout.strip().splitlines()[-1]))

    app = tables("import src.main, src.worker.main, src.worker.nhc")
    registry = tables(
        "from src.model_registry import import_all_models\nimport_all_models()"
    )
    assert app - registry == set(), "add these model modules to src/model_registry.py"
