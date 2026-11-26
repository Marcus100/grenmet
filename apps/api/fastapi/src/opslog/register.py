"""What the opslog domain adds to the app (ADR-0031 manifest).

Import paths only: ``src.database`` reads this file (see ``src/domain_manifest.py``).
"""

from src.domain_manifest import Domain, Mount

DOMAIN = Domain(
    name="opslog",
    mounts=(Mount("opslog.org", "src.opslog.router:router"),),
    schemas=("opslog",),
    model_modules=("src.opslog.models",),
    registrations=("src.opslog.audit",),
    worker_modules=("src.opslog.outbox_handlers",),
)
