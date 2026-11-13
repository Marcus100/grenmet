"""What the webhooks_out domain adds to the app (ADR-0031 manifest)."""

from src.domain_manifest import Domain, Mount
from src.webhooks_out.router import router

DOMAIN = Domain(
    name="webhooks_out",
    mounts=(Mount("webhooks_out.webhooks_out", router),),
)
