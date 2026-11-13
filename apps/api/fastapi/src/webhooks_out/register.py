"""What the webhooks_out domain adds to the app (ADR-0031 manifest).

Import paths only: ``src.database`` reads this file (see ``src/domain_manifest.py``).
"""

from src.domain_manifest import Domain, Mount

DOMAIN = Domain(
    name="webhooks_out",
    mounts=(Mount("webhooks_out.webhooks_out", "src.webhooks_out.router:router"),),
    schemas=("webhooks",),
    model_modules=("src.webhooks_out.models",),
    registrations=("src.webhooks_out.audit",),
)
