"""Change history for webhook endpoints, grouped under the owning organisation.

The encrypted signing secret never reaches history; the failure counter is left
out because workers write it on every failed attempt. Deliveries are their own
audit trail and are not tracked.
"""

from src.audit import registry

from .models import WebhookEndpoint


def register() -> None:
    registry.track(
        WebhookEndpoint,
        record_type="webhook_endpoint",
        entity_type="platform_organisation",
        entity_id_attr="organisation_id",
        exclude=("secret_encrypted", "consecutive_failures"),
        label="Webhook endpoint",
    )
