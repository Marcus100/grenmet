"""The weather report at the time of an incident (#1876).

Stored on the incident as the raw METAR or SPECI text, its station and its time,
so the record still reads the same if the observation store later changes. The
report is taken from Met Service aerodrome observations (``wxproducts``): the one
nearest the incident's time, looked for from 90 minutes before to 30 minutes
after (routine METARs are issued every hour or half hour; a SPECI marks a change
in between, ICAO Annex 3). When no observation store is configured, or nothing
was observed in that window, the report can be typed in by hand and is marked
``manual``. Aerodrome reports are public, so no organisation boundary applies to
reading them.
"""

import logging
import re
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import AppException, AppValidationError
from src.wxproducts import database as wx_database
from src.wxproducts.observation_service import list_observations
from src.wxproducts.observations import ObservationKind

from . import service
from .exceptions import IncidentConflictError
from .models import Incident, IncidentStatus

logger = logging.getLogger(__name__)

BEFORE = timedelta(minutes=90)
AFTER = timedelta(minutes=30)
STATION = re.compile(r"^[A-Z]{4}$")

SOURCE_OBSERVATION = "observation"
SOURCE_MANUAL = "manual"


class WeatherNotAvailableError(AppException):
    def __init__(self, message: str) -> None:
        super().__init__(message, 404)


@dataclass(frozen=True)
class Report:
    station: str
    observed_at: datetime  # naive UTC
    text: str


async def nearest_report(station: str, at: datetime) -> Report | None:
    """The METAR or SPECI of ``station`` nearest ``at`` (naive UTC) in the window.

    ``None`` when the observation store is not configured, cannot be reached or
    holds nothing there: the caller then asks for a typed report."""
    session = wx_database.create_session()
    if session is None:
        return None
    moment = at.replace(tzinfo=UTC)
    found: list[Report] = []
    kinds: tuple[ObservationKind, ...] = ("METAR", "SPECI")
    try:
        async with session:
            for kind in kinds:
                rows = await list_observations(
                    session,
                    kind=kind,
                    station=station,
                    start=moment - BEFORE,
                    end=moment + AFTER,
                    limit=20,
                )
                for row in rows:
                    text = row.provenance.raw_tac
                    if row.observed_at is None or not text:
                        continue
                    found.append(
                        Report(
                            station=station,
                            observed_at=row.observed_at.astimezone(UTC).replace(
                                tzinfo=None
                            ),
                            text=text.strip()[:1000],
                        )
                    )
    except (SQLAlchemyError, OSError, TimeoutError, ValueError) as exc:
        logger.warning(
            "Weather observations could not be read for an incident",
            extra={"station": station, "error": type(exc).__name__},
        )
        return None
    if not found:
        return None
    return min(found, key=lambda report: abs(report.observed_at - at))


async def set_weather(
    session: AsyncSession,
    *,
    organisation_id: str,
    incident_id: str,
    station: str,
    report: str | None,
    observed_at: datetime | None,
) -> Incident:
    """Attach the weather report: looked up when ``report`` is left out, typed in
    otherwise. Replacing it is allowed until the incident closes and is audited."""
    code = station.strip().upper()
    if not STATION.match(code):
        raise AppValidationError("The station is a four-letter ICAO location indicator")
    typed = (report or "").strip()
    found: Report | None = None
    if not typed:
        # Looked up before the row lock: it uses another database connection.
        incident = await service.get_incident(
            session, organisation_id=organisation_id, incident_id=incident_id
        )
        found = await nearest_report(code, incident.occurred_at)
        if found is None:
            raise WeatherNotAvailableError(
                "No weather report was found for that station near the incident's "
                "time; type the report in instead"
            )
    looked_up_for = incident.occurred_at if found is not None else None
    incident = await service.get_incident(
        session, organisation_id=organisation_id, incident_id=incident_id, lock=True
    )
    if incident.status == IncidentStatus.CLOSED.value:
        raise IncidentConflictError("This incident is closed; reopen it to change it")
    if looked_up_for is not None and incident.occurred_at != looked_up_for:
        # The incident's time was changed while the report was being looked up.
        raise IncidentConflictError(
            "The incident's time changed while the weather was looked up; try again"
        )
    if found is not None:
        incident.weather_station = found.station
        incident.weather_observed_at = found.observed_at
        incident.weather_report = found.text
        incident.weather_source = SOURCE_OBSERVATION
    else:
        incident.weather_station = code
        incident.weather_observed_at = (
            service.naive_utc(observed_at) if observed_at else incident.occurred_at
        )
        incident.weather_report = typed[:1000]
        incident.weather_source = SOURCE_MANUAL
    await session.flush()
    return incident
