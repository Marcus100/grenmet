"""Contact change history, grouped under the organisation's history subject.

Readable by that organisation's admins and owners (the ``platform_organisation``
read check). Email, hash, name and phone are personal data and never copied.
"""

from src.audit import registry

from .models import Contact, ContactConsent

SUBJECT = "platform_organisation"


def register() -> None:
    registry.track(
        Contact,
        record_type="contact",
        entity_type=SUBJECT,
        entity_id_attr="organisation_id",
        exclude=("email", "email_hash", "name", "phone"),
        label="Contact",
    )
    registry.track(
        ContactConsent,
        record_type="contact_consent",
        entity_type=SUBJECT,
        entity_id_attr="organisation_id",
        label="Contact consent",
    )
