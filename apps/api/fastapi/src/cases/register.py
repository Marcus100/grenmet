"""What the cases domain adds to the app (ADR-0031 manifest).

Import paths only: ``src.database`` reads this file (see ``src/domain_manifest.py``).
"""

from src.domain_manifest import Domain, Mount

DOMAIN = Domain(
    name="cases",
    mounts=(Mount("cases.org", "src.cases.router:router"),),
    schemas=("cases",),
    model_modules=("src.cases.models",),
    registrations=(
        "src.cases.audit",
        "src.cases.record_links",
        "src.cases.notifications",
    ),
)
