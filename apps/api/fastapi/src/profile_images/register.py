"""What the profile_images domain adds to the app (ADR-0031 manifest).

Import paths only: ``src.database`` reads this file (see ``src/domain_manifest.py``).
"""

from src.domain_manifest import Domain, Mount

DOMAIN = Domain(
    name="profile_images",
    mounts=(
        Mount("profile_images.profile_images", "src.profile_images.router:router"),
    ),
    registrations=("src.profile_images.audit",),
)
