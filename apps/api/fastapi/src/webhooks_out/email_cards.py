"""The "webhook endpoint disabled" notice as a card (``src.email_layout``). Pure."""

from src import email_layout as layout


def endpoint_disabled(*, endpoint_id: str, host: str, reason: str) -> layout.EmailCard:
    """Sent to an organisation's owners and admins. ``host`` is the receiver's
    host name only (no path, no secret)."""
    card = layout.EmailCard(
        title="A webhook endpoint was disabled",
        paragraphs=("It is no longer receiving events.",),
        rows=(
            layout.Row("Endpoint", endpoint_id),
            layout.Row("Host", host),
            layout.Row("Reason", reason),
        ),
        policy=(
            "Fix the receiver, then re-enable the endpoint in your organisation "
            "settings. Events sent while it was disabled are not replayed.",
        ),
        footer="You are getting this email because you manage webhooks for this organisation.",
    )
    return layout.with_subject("A webhook endpoint was disabled", card)
