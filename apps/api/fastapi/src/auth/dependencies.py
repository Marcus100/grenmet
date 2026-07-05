"""Auth dependency re-exports.

Routers import ``get_current_active_superuser`` from here; the canonical
definition lives in ``src.dependencies``. The explicit ``as`` re-export marks it
intentional so it is not flagged as an unused import.
"""

from src.dependencies import (
    get_current_active_superuser as get_current_active_superuser,
)
