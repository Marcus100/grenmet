"""What the monitoring domain adds to the app (ADR-0031 manifest).

Import paths only: ``src.database`` reads this file (see ``src/domain_manifest.py``).
"""

from src.domain_manifest import Domain, Mount

DOMAIN = Domain(
    name="monitoring",
    mounts=(Mount("monitoring.admin", "src.monitoring.router:router"),),
)
