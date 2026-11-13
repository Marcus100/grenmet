"""Self-registering API domains (ADR-0031).

A domain describes what it adds to the app in ``src/<domain>/register.py`` as
a ``Domain`` manifest, and this module holds the one shared, ordered list.
``src/main.py`` mounts routers in ``MOUNT_ORDER``; the order is part of the
public OpenAPI contract (path order in ``openapi.json``), so it is written out
here rather than discovered from the filesystem.

Domains not yet migrated keep their routers in ``main.py`` (``_LEGACY_MOUNTS``)
under the same keys. Migration steps and what stays out of scope: ADR-0031.
"""

from collections.abc import Iterable, Mapping

from src.domain_manifest import Domain, Mount
from src.webhooks_out.register import DOMAIN as WEBHOOKS_OUT

# Registered manifests, one line per migrated domain.
DOMAINS: tuple[Domain, ...] = (WEBHOOKS_OUT,)

# Every router of the app, in mount order (legacy and registered alike).
MOUNT_ORDER: tuple[str, ...] = (
    "auth.login",
    "auth.users",
    "auth.twofa",
    "auth.roles",
    "auth.permissions",
    "auth.role_assignments",
    "billing.billing",
    "billing.invoices",
    "rewards.rewards",
    "payments.payments",
    "bookings.bookings",
    "bookings.settings",
    "hr.profile",
    "hr.workflow",
    "hr.roster",
    "hr.calendar",
    "hr.timesheet",
    "hr.clock",
    "hr.attendance",
    "hr.payroll",
    "hr.training",
    "hr.signatures",
    "hr.leave",
    "hr.absentee",
    "hr.exchange",
    "hr.dailystatus",
    "hr.parking",
    "hr.documents",
    "audit.audit",
    "stores.stores",
    "notifications.notifications",
    "organisations.organisations",
    "feature_flags.feature_flags",
    "contacts.contacts",
    "cap.cap",
    "cap.public",
    "utils.utils",
    "storage.weather_images",
    "storage.uploads",
    "webhooks.webhooks",
    "webhooks_out.webhooks_out",
    "subscriptions.subscriptions",
    "push.push",
    "contact.contact",
    "feedback.feedback",
    "content_distribution.content_distribution",
    "flights.flights",
    "environmental.environmental",
    "almanac.almanac",
    "models_guidance.models_guidance",
    "wxproducts.wxproducts",
    "eregister.eregister",
    "wxwatch.wxwatch",
    "wxwatch.public",
    "wxwatch.nhc",
    "wxwatch.ingestion",
    "auth.browser",
    "janitorial.janitorial",
    "transport.transport",
    "events.events",
    "events.moderation",
    "events.org",
    "events.staff",
    "auth.onboarding",
    "auth.modern",
    "auth.app",
    "auth.account_apps",
    "baseline.staff_setup",
    "hr.dashboard",
    "baseline.governance",
)


def ordered_mounts(
    legacy: Mapping[str, Mount], domains: Iterable[Domain] = DOMAINS
) -> list[Mount]:
    """Every mount in ``MOUNT_ORDER``; fails on a gap, a duplicate or a stray key."""
    by_key: dict[str, Mount] = {}
    names: set[str] = set()
    for domain in domains:
        if domain.name in names:
            raise ValueError(f"API domain {domain.name!r} is registered twice")
        names.add(domain.name)
        for mount in domain.mounts:
            if not mount.key.startswith(f"{domain.name}."):
                raise ValueError(
                    f"mount {mount.key!r} must start with {domain.name + '.'!r}"
                )
            if mount.key in by_key:
                raise ValueError(f"mount {mount.key!r} is registered twice")
            by_key[mount.key] = mount
    for key, mount in legacy.items():
        if key != mount.key:
            raise ValueError(f"legacy mount {key!r} is filed as {mount.key!r}")
        if key in by_key:
            raise ValueError(f"mount {key!r} is both legacy and registered")
        by_key[key] = mount
    if len(set(MOUNT_ORDER)) != len(MOUNT_ORDER):
        raise ValueError("MOUNT_ORDER lists a mount twice")
    missing = sorted(set(by_key) - set(MOUNT_ORDER))
    unknown = sorted(set(MOUNT_ORDER) - set(by_key))
    if missing or unknown:
        raise ValueError(
            f"MOUNT_ORDER and the mounts disagree: not in MOUNT_ORDER {missing}, "
            f"no router for {unknown}"
        )
    return [by_key[key] for key in MOUNT_ORDER]
