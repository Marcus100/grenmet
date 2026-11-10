"""Aerodrome reference for the aviation encoders (pure data; no I/O).

Only the two Grenada aerodromes GMS reports for. Values are NOT yet confirmed by GMS
against the Grenada AIP: they are taken from public sources (below) and must be
confirmed before any aerodrome location is transmitted.

Sources, checked 9 November 2026:
- OurAirports `airports.csv` (public domain, https://ourairports.com/data/): TGPY
  lat 12.003996 lon -61.785302 elevation 41 ft; TGPZ lat 12.4761 lon -61.472801
  elevation 5 ft.
- English Wikipedia infoboxes (Maurice Bishop International Airport, Lauriston
  Airport): elevation 41 ft and 5 ft; coordinates agree within about 0.001 degree.

Elevations are metres above mean sea level (feet converted at 0.3048 m per foot);
the vertical datum is taken as EGM_96, the AIXM value the IWXXM examples use.
"""

from dataclasses import dataclass

VERTICAL_DATUM = "EGM_96"


@dataclass(frozen=True)
class Aerodrome:
    icao: str
    name: str
    latitude: float
    longitude: float
    elevation_m: float
    vertical_datum: str = VERTICAL_DATUM


AERODROMES: dict[str, Aerodrome] = {
    # 41 ft = 12.497 m. MBIA, the observing station 78958 reports for.
    "TGPY": Aerodrome(
        icao="TGPY",
        # AIXM names are upper case (the IWXXM pattern rejects lower case).
        name="MAURICE BISHOP INTERNATIONAL AIRPORT",
        latitude=12.003996,
        longitude=-61.785302,
        elevation_m=12.5,
    ),
    # 5 ft = 1.524 m. Lauriston Airport, Carriacou.
    "TGPZ": Aerodrome(
        icao="TGPZ",
        name="LAURISTON AIRPORT",
        latitude=12.4761,
        longitude=-61.472801,
        elevation_m=1.5,
    ),
}


def get(icao: str) -> Aerodrome | None:
    """The reference for an ICAO location indicator, or None when not in the table."""
    return AERODROMES.get(icao.strip().upper())
