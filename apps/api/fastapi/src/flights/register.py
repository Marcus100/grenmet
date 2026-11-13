"""What the flights domain adds to the app (ADR-0031 manifest).

Import paths only: ``src.database`` reads this file (see ``src/domain_manifest.py``).
"""

from src.domain_manifest import Domain, Mount, WorkerJob

DOMAIN = Domain(
    name="flights",
    mounts=(Mount("flights.flights", "src.flights.router:router"),),
    jobs=(
        # OpenSky flight movements every 30 minutes; no-op unless the flag is on.
        WorkerJob(
            "src.flights.jobs:poll_flights",
            cron={"minute": {5, 35}, "run_at_startup": False},
        ),
    ),
)
