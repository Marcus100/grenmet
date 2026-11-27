"""What the opslog domain adds to the app (ADR-0031 manifest).

Import paths only: ``src.database`` reads this file (see ``src/domain_manifest.py``).
"""

from src.domain_manifest import Domain, Mount, WorkerJob

DOMAIN = Domain(
    name="opslog",
    mounts=(Mount("opslog.org", "src.opslog.router:router"),),
    schemas=("opslog",),
    model_modules=("src.opslog.models",),
    registrations=("src.opslog.audit", "src.opslog.summary"),
    worker_modules=("src.opslog.outbox_handlers",),
    jobs=(
        # Daily summaries at 10:05 UTC, just after 06:00 in the Eastern Caribbean.
        WorkerJob(
            "src.opslog.jobs:send_opslog_daily_summaries",
            cron={"hour": {10}, "minute": {5}},
        ),
    ),
)
