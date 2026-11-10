"""Almanac locations. Coordinates are the repo's existing station references.

- ``mbia``: WMO 78958 station position, ``eregister/config.py``
  (``WIS2BOX_STATION_LATITUDE`` / ``_LONGITUDE``).
- ``lauriston``: the airfield reference used by ``models_guidance/config.py``. No
  surveyed aerodrome table exists in the repo; confirm before publishing.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class Location:
    key: str
    name: str
    latitude: float
    longitude: float


LOCATIONS: dict[str, Location] = {
    "mbia": Location(
        key="mbia",
        name="Maurice Bishop International Airport (Grenada)",
        latitude=12.0042,
        longitude=-61.7862,
    ),
    "lauriston": Location(
        key="lauriston",
        name="Lauriston Airport (Carriacou)",
        latitude=12.476,
        longitude=-61.472,
    ),
}
