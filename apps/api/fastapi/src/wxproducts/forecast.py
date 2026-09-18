"""Public forecast selection; one server clock and explicit source periods."""

import math
from datetime import UTC, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession

from . import service
from .schemas import (
    ForecastObservation,
    ForecastPeriod,
    ForecastSource,
    PublicForecast,
    PublishedProduct,
)
from .validation import GRENADA, ISSUE_HOURS, local_time, number


def source(product: PublishedProduct) -> ForecastSource:
    return ForecastSource(
        product_id=product.id,
        revision=product.revision,
        kind=product.kind,
        issued_at=local_time(
            f"{product.values['issuedAt'][:10]}T{ISSUE_HOURS[product.kind]:02}:00"
        ).astimezone(UTC),
        published_at=datetime.fromisoformat(product.publishedAt).astimezone(UTC),
    )


def temperature(value: str) -> float | None:
    result = number(value)
    return result if value.strip() and math.isfinite(result) else None


def period(product: PublishedProduct, day: datetime, prefix: str) -> ForecastPeriod:
    provenance = source(product)

    def value(key: str) -> str:
        return product.values.get(
            prefix + key[0].upper() + key[1:] if prefix else key, ""
        )

    details = {
        key: value(key)
        for key in ("wind", "seaState", "highTides", "lowTides", "sunrise", "sunset")
    }
    details["summary"] = product.values.get(
        prefix + "Weather" if prefix else "summary", ""
    )
    if not prefix:
        for key in ("observedTemperature", "word", "definition"):
            if product.values.get(key):
                details[key] = product.values[key]
    return ForecastPeriod(
        date=day.date().isoformat(),
        valid_from=day.astimezone(UTC) if prefix else provenance.issued_at,
        valid_to=(day + timedelta(days=1)).astimezone(UTC),
        source=provenance,
        period_key=prefix,
        high=temperature(
            product.values.get(prefix + "Max" if prefix else "maxTemperature", "")
        ),
        low=temperature(
            product.values.get(prefix + "Min" if prefix else "minTemperature", "")
        ),
        details=details,
    )


def select_forecast(products: list[PublishedProduct], now: datetime) -> PublicForecast:
    if now.tzinfo is None:
        raise ValueError("Forecast clock must be timezone aware")
    base = (now.astimezone(GRENADA) - timedelta(hours=7)).replace(
        hour=7, minute=0, second=0, microsecond=0
    )
    forecasts = sorted(
        (p for p in products if p.kind in ISSUE_HOURS and service.is_current(p, now)),
        key=lambda p: (
            source(p).issued_at,
            source(p).published_at,
            p.revision,
            str(p.id),
        ),
        reverse=True,
    )
    current = next(
        (p for p in forecasts if source(p).issued_at.date() == base.date()), None
    )
    outlook = next((p for p in forecasts if p.kind == "evening"), None)
    periods = []
    for offset in range(5):
        day = base + timedelta(days=offset)
        if offset == 0 and current:
            periods.append(period(current, day, ""))
        elif (
            offset > 0
            and outlook
            and 1 <= (day.date() - source(outlook).issued_at.date()).days <= 4
        ):
            index = (day.date() - source(outlook).issued_at.date()).days
            periods.append(period(outlook, day, f"day{index}"))
        else:
            periods.append(
                ForecastPeriod(
                    date=day.date().isoformat(),
                    valid_from=day.astimezone(UTC),
                    valid_to=(day + timedelta(days=1)).astimezone(UTC),
                )
            )
    observed = next(
        (
            p
            for p in forecasts
            if p.kind == "midday"
            and source(p).issued_at.date() == base.date()
            and temperature(p.values.get("observedTemperature", "")) is not None
        ),
        None,
    )
    observation = None
    if observed:
        value = temperature(observed.values.get("observedTemperature", ""))
        if value is not None:
            observation = ForecastObservation(
                temperature=value, source=source(observed)
            )
    return PublicForecast(
        as_of=now.astimezone(UTC),
        base_date=base.date().isoformat(),
        periods=periods,
        observation=observation,
    )


async def load_forecast(session: AsyncSession, now: datetime) -> PublicForecast:
    return select_forecast(
        await service.list_published_products(session, None, now=now), now
    )
