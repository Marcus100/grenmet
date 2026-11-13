"""What the contacts domain adds to the app (ADR-0031 manifest).

Import paths only: ``src.database`` reads this file (see ``src/domain_manifest.py``).
"""

from src.domain_manifest import Domain, Mount

DOMAIN = Domain(
    name="contacts",
    mounts=(Mount("contacts.contacts", "src.contacts.router:router"),),
    schemas=("org",),
    model_modules=("src.contacts.models",),
    registrations=("src.contacts.audit",),
)
