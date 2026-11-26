"""Starter templates for a self sign-up (ADR-0066 item 8).

Fixed data: a short list of services per business type, each with a name, a length and
a suggested price in whole Eastern Caribbean dollars. Nothing here sets a deposit, a
policy or hours beyond the default weekday hours every new business gets. Everything is
editable in Studio after sign-up. Prices are suggestions, not a rate card.
"""

from dataclasses import dataclass
from datetime import time

from .models import BookingBusinessType

#: Every new business starts with these hours (Monday to Friday, weekday 0 is Monday).
DEFAULT_WEEKDAYS = (0, 1, 2, 3, 4)
DEFAULT_OPEN = time(9, 0)
DEFAULT_CLOSE = time(17, 0)


@dataclass(frozen=True)
class TemplateService:
    name: str
    duration_min: int
    #: Whole Eastern Caribbean dollars; stored as minor units (cents) times 100.
    price_ec: int


@dataclass(frozen=True)
class StarterTemplate:
    key: str
    label: str
    business_type: BookingBusinessType
    services: tuple[TemplateService, ...]


def _svc(name: str, minutes: int, price_ec: int) -> TemplateService:
    return TemplateService(name=name, duration_min=minutes, price_ec=price_ec)


_TEMPLATES: tuple[StarterTemplate, ...] = (
    StarterTemplate(
        key="hair-salon",
        label="Hair salon",
        business_type=BookingBusinessType.HAIR,
        services=(
            _svc("Wash, cut and blow-dry", 75, 150),
            _svc("Blow-dry", 45, 80),
            _svc("Full colour", 120, 250),
            _svc("Relaxer treatment", 90, 200),
        ),
    ),
    StarterTemplate(
        key="barber",
        label="Barber",
        business_type=BookingBusinessType.HAIR,
        services=(
            _svc("Haircut", 30, 40),
            _svc("Beard trim", 15, 20),
            _svc("Haircut and beard", 45, 60),
            _svc("Hot towel shave", 30, 50),
        ),
    ),
    StarterTemplate(
        key="nails",
        label="Nails",
        business_type=BookingBusinessType.BEAUTY,
        services=(
            _svc("Manicure", 45, 60),
            _svc("Pedicure", 60, 80),
            _svc("Gel polish", 60, 90),
            _svc("Acrylic set", 90, 150),
        ),
    ),
    StarterTemplate(
        key="lashes-brows",
        label="Lashes and brows",
        business_type=BookingBusinessType.BEAUTY,
        services=(
            _svc("Classic lash set", 90, 150),
            _svc("Lash fill", 60, 90),
            _svc("Brow shape and tint", 30, 50),
            _svc("Lash lift", 60, 120),
        ),
    ),
    StarterTemplate(
        key="massage-spa",
        label="Massage and spa",
        business_type=BookingBusinessType.BEAUTY,
        services=(
            _svc("Swedish massage", 60, 180),
            _svc("Deep tissue massage", 60, 200),
            _svc("Facial", 60, 160),
            _svc("Couples massage", 90, 340),
        ),
    ),
    StarterTemplate(
        key="fitness-coach",
        label="Fitness coach",
        business_type=BookingBusinessType.FITNESS,
        services=(
            _svc("Personal training session", 60, 120),
            _svc("Fitness assessment", 45, 80),
            _svc("Nutrition consultation", 45, 100),
            _svc("Online check-in", 30, 60),
        ),
    ),
    StarterTemplate(
        key="tutor",
        label="Tutor",
        business_type=BookingBusinessType.LESSONS,
        services=(
            _svc("One-to-one lesson", 60, 100),
            _svc("Exam preparation", 90, 150),
            _svc("Homework help", 45, 70),
            _svc("Trial lesson", 30, 40),
        ),
    ),
    StarterTemplate(
        key="tour-operator",
        label="Tour operator",
        business_type=BookingBusinessType.TOURS,
        services=(
            _svc("Half-day tour", 240, 350),
            _svc("Full-day tour", 480, 600),
            _svc("Airport transfer", 60, 200),
        ),
    ),
    StarterTemplate(
        key="photographer",
        label="Photographer",
        business_type=BookingBusinessType.PROFESSIONAL,
        services=(
            _svc("Portrait session", 60, 250),
            _svc("Headshot session", 45, 200),
            _svc("Event coverage, two hours", 120, 500),
        ),
    ),
    StarterTemplate(
        key="blank",
        label="Blank",
        business_type=BookingBusinessType.OTHER,
        services=(),
    ),
)

#: Keyed by template key, in the order shown to the visitor.
STARTER_TEMPLATES: dict[str, StarterTemplate] = {t.key: t for t in _TEMPLATES}
