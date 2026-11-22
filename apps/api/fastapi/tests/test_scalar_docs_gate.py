"""/scalar is registered only where the OpenAPI schema is served (issue #1414)."""

from src.config import settings
from src.main import SHOW_DOCS_ENVIRONMENTS, app


def test_scalar_route_matches_docs_environment() -> None:
    registered = any(getattr(route, "path", None) == "/scalar" for route in app.routes)
    assert registered == (settings.ENVIRONMENT in SHOW_DOCS_ENVIRONMENTS)
