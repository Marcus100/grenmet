"""What the commerce domain adds to the app (ADR-0031 manifest).

Import paths only: ``src.database`` reads this file (see ``src/domain_manifest.py``).
"""

from src.domain_manifest import Domain, Mount

DOMAIN = Domain(
    name="commerce",
    mounts=(Mount("commerce.org", "src.commerce.router:router"),),
    schemas=("commerce",),
    model_modules=("src.commerce.models",),
)
