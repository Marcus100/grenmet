"""What the printix domain adds to the app (ADR-0031 manifest).

Import paths only: ``src.database`` reads this file (see ``src/domain_manifest.py``).
"""

from src.domain_manifest import Domain, Mount, WorkerJob

DOMAIN = Domain(
    name="printix",
    mounts=(
        Mount("printix.admin", "src.printix.admin_router:router"),
        Mount("printix.scanner", "src.printix.scanner_router:router"),
    ),
    schemas=("printix",),
    model_modules=("src.printix.models",),
    registrations=("src.printix.audit",),
    jobs=(
        # Nightly scan-log retention (ADR-0060): 90 days after an event closes.
        WorkerJob(
            "src.printix.jobs:purge_scan_log", cron={"hour": {3}, "minute": {40}}
        ),
    ),
)
