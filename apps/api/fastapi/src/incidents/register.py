"""What the incidents domain adds to the app (ADR-0031 manifest).

Import paths only: ``src.database`` reads this file (see ``src/domain_manifest.py``).
"""

from src.domain_manifest import Domain, Mount

DOMAIN = Domain(
    name="incidents",
    mounts=(Mount("incidents.org", "src.incidents.router:router"),),
    schemas=("incidents",),
    model_modules=("src.incidents.models",),
    registrations=("src.incidents.audit", "src.incidents.record_links"),
)
