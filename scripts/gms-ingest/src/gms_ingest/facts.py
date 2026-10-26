"""Conservative, source-preserving extraction; unsupported prose stays prose."""

import math
import re

FAMILIES = {"tropical_development", "active_cyclones", "marine", "aviation_recon"}


def family(record):
    code = (record.get("code") or record.get("id") or "").upper()
    url = record.get("url", "").upper()
    if record.get("group") == "recon" or "TCANT" in code or "TCANT" in url:
        return "aviation_recon"
    if (
        record.get("storm_id")
        or record.get("group") == "storms"
        or re.search(r"AL\d{6}|WSP|TOA", code + url)
    ):
        return "active_cyclones"
    if record.get("group") in {"charts", "grids"} or code in {"OFFNT3", "HSFAT2"}:
        return "marine"
    return "tropical_development"


def _number(value):
    try:
        number = float(str(value).strip())
    except TypeError, ValueError:
        return None
    return number if math.isfinite(number) else None


def _property(properties, name):
    for key, value in properties.items():
        if key and key.lower() == name.lower():
            return value
    return None


def _chance(text, category, horizon):
    """One map chance such as '10%' or 'near 0%'; unrecognised wording is skipped."""
    match = re.fullmatch(r"\s*(near\s+)?(\d{1,3})\s*%?\s*", text or "", re.I)
    if not match or not 0 <= int(match[2]) <= 100:
        return None
    return {
        "key": "formation_probability",
        "record_type": "forecast",
        "value": None if match[1] else int(match[2]),
        "unit": "percent",
        "horizon_hours": horizon,
        "description": (category or "").strip().lower(),
        "qualifier": "near" if match[1] else None,
        "source_text": f"{text.strip()} ({(category or '').strip()})",
    }


def _points(geometry):
    if geometry["type"] == "Point":
        return [geometry["coordinates"]]
    if geometry["type"] == "LineString":
        return geometry["coordinates"]
    if geometry["type"] == "Polygon":
        return [point for ring in geometry["coordinates"] for point in ring]
    if geometry["type"] == "GeometryCollection":
        return [point for child in geometry["geometries"] for point in _points(child)]
    return []


def outlook_map_systems(features):
    """Graphical outlook placemarks grouped by their NHC disturbance number.

    Each disturbance has a point (current position) and a polygon (the area
    where formation may occur within 7 days); both repeat the same chances.
    """
    grouped = {}
    for feature in features:
        properties = feature.get("properties") or {}
        number = _property(properties, "Disturbance")
        if number is None or not str(number).strip():
            continue
        grouped.setdefault(str(number).strip(), []).append(feature)
    systems = []
    for number, members in grouped.items():
        properties = members[0]["properties"]
        discussion = (_property(properties, "Discussion") or "").strip()
        heading = re.match(r"\s*\d+\.\s*([^:\n]+):", discussion)
        facts = [
            fact
            for fact in (
                _chance(
                    _property(properties, f"{days}day_percentage"),
                    _property(properties, f"{days}day_category"),
                    hours,
                )
                for days, hours in (("2", 48), ("7", 168))
            )
            if fact
        ]
        for feature in members:
            geometry = feature["geometry"]
            if geometry["type"] == "Point":
                longitude, latitude = geometry["coordinates"][:2]
                for key, value, unit in (
                    ("latitude", latitude, "degrees_north"),
                    ("longitude", longitude, "degrees_east"),
                ):
                    facts.append(
                        {
                            "key": key,
                            "record_type": "analysis",
                            "value": float(value),
                            "unit": unit,
                            "qualifier": "near",
                            "source_text": f"Outlook map position of disturbance {number}",
                        }
                    )
            elif geometry["type"] in {"Polygon", "GeometryCollection"}:
                points = _points(geometry)
                if not points:
                    continue
                longitudes = [point[0] for point in points]
                latitudes = [point[1] for point in points]
                for key, value, unit in (
                    ("latitude_min", min(latitudes), "degrees_north"),
                    ("latitude_max", max(latitudes), "degrees_north"),
                    ("longitude_west", min(longitudes), "degrees_east"),
                    ("longitude_east", max(longitudes), "degrees_east"),
                ):
                    facts.append(
                        {
                            "key": key,
                            "record_type": "forecast",
                            "value": round(value, 2),
                            "unit": unit,
                            "horizon_hours": 168,
                            "source_text": f"Outlook map 7-day formation area of disturbance {number}",
                        }
                    )
        systems.append(
            {
                "source_feature_key": number,
                "name": heading[1].strip() if heading else f"Disturbance {number}",
                "feature_type": "disturbance",
                "narrative": " ".join(discussion.split()),
                "facts": facts,
            }
        )
    return systems


CLASSIFICATIONS = {
    "TD": ("Tropical Depression", "tropical_cyclone"),
    "TS": ("Tropical Storm", "tropical_cyclone"),
    "HU": ("Hurricane", "tropical_cyclone"),
    "STD": ("Subtropical Depression", "tropical_cyclone"),
    "STS": ("Subtropical Storm", "tropical_cyclone"),
    "PTC": ("Potential Tropical Cyclone", "disturbance"),
    "PC": ("Post-Tropical Cyclone", "other"),
}
MPH_TO_KT = 0.868976
COMPASS = (
    "north north-northeast northeast east-northeast east east-southeast southeast "
    "south-southeast south south-southwest southwest west-southwest west "
    "west-northwest northwest north-northwest"
).split()


def storm_systems(storms):
    """Active cyclones from CurrentStorms.json (already filtered to the Atlantic).

    NHC documents intensity in knots, pressure in millibars, movement direction
    in degrees and movement speed in miles per hour (converted to knots here).
    """
    systems = []
    for storm in storms:
        code = str(storm.get("classification") or "").upper()
        label, feature_type = CLASSIFICATIONS.get(code, (code or "Cyclone", "other"))
        name = str(storm.get("name") or storm["id"].upper())
        # (key, value, unit, description, source wording) for each decoded number.
        entries = []
        latitude = _number(storm.get("latitudeNumeric"))
        longitude = _number(storm.get("longitudeNumeric"))
        if latitude is not None and longitude is not None:
            source = (
                f"{storm.get('latitude', latitude)} {storm.get('longitude', longitude)}"
            )
            entries.append(("latitude", latitude, "degrees_north", "", source))
            entries.append(("longitude", longitude, "degrees_east", "", source))
        direction = _number(storm.get("movementDir"))
        if direction is not None and 0 <= direction <= 360:
            compass = COMPASS[round(direction / 22.5) % 16]
            source = f"movementDir {storm.get('movementDir')}"
            entries.append(
                ("movement_direction", direction, "degrees", compass, source)
            )
        speed = _number(storm.get("movementSpeed"))
        if speed is not None and speed >= 0:
            # Knots, like the forecast advisory, so every movement speed shares a unit.
            source = f"movementSpeed {storm.get('movementSpeed')} mph"
            entries.append(
                ("movement_speed", round(speed * MPH_TO_KT, 1), "kt", "", source)
            )
        pressure = _number(storm.get("pressure"))
        if pressure is not None:
            source = f"pressure {storm.get('pressure')}"
            entries.append(("pressure", pressure, "hPa", "", source))
        wind = _number(storm.get("intensity"))
        if wind is not None:
            source = f"intensity {storm.get('intensity')}"
            entries.append(("maximum_wind", wind, "kt", "", source))
        facts = []
        for key, value, unit, description, source in entries:
            fact = {
                "key": key,
                "record_type": "analysis",
                "value": value,
                "unit": unit,
                "description": description,
                "source_text": source,
            }
            if storm.get("lastUpdate"):
                fact["reference_time"] = storm["lastUpdate"]
            facts.append(fact)
        systems.append(
            {
                "source_feature_key": storm["id"].lower(),
                "name": f"{label} {name}",
                "feature_type": feature_type,
                "narrative": "",
                "facts": facts,
            }
        )
    return systems


def extract(decoded):
    systems = outlook_map_systems(decoded.get("features", [])) + storm_systems(
        decoded.get("storms", [])
    )
    for disturbance in decoded.get("disturbances", []):
        facts = []
        for period, probability in disturbance["probabilities"].items():
            facts.append(
                {
                    "key": "formation_probability",
                    "record_type": "forecast",
                    "value": probability["percent"],
                    "unit": "percent",
                    "horizon_hours": 48 if period == "48 hours" else 168,
                    "description": probability["category"],
                    "qualifier": "near" if probability["percent"] is None else None,
                    "source_text": probability["statement"],
                }
            )
        systems.append(
            {
                "source_feature_key": str(disturbance["index"]),
                "name": disturbance["heading"].rstrip(":"),
                "feature_type": "disturbance",
                "narrative": disturbance["narrative"],
                "facts": facts,
            }
        )
    # TWD tropical-wave paragraphs have a wave axis and may contain a distinct low.
    for section in decoded.get("sections", []):
        if section["heading"].upper() != "TROPICAL WAVES":
            continue
        for index, paragraph in enumerate(section["text"].split("\n\n")):
            body = " ".join(paragraph.split())
            axis = re.search(
                r"tropical wave.*?\b(?:along|near)\s+(\d+(?:\.\d+)?)([EW])", body, re.I
            )
            if not axis:
                continue
            key = f"wave-{index}"
            wave_facts = [
                {
                    "key": "axis_longitude",
                    "record_type": "analysis",
                    "value": float(axis[1]) * (-1 if axis[2].upper() == "W" else 1),
                    "unit": "degrees_east",
                    "source_text": axis[0],
                }
            ]
            northern = re.search(r"(?:south of|from) (\d+(?:\.\d+)?)N", body, re.I)
            if northern:
                wave_facts.append(
                    {
                        "key": "axis_northern_limit",
                        "record_type": "analysis",
                        "value": float(northern[1]),
                        "unit": "degrees_north",
                        "source_text": northern[0],
                    }
                )
            movement = re.search(
                r"moving (westward|west|eastward|east|northward|north|southward|south) (?:at )?(\d+)(?: to (\d+))? (?:kt|knots)",
                body,
                re.I,
            )
            if movement:
                wave_facts.extend(
                    [
                        {
                            "key": "movement_direction",
                            "record_type": "analysis",
                            "description": movement[1],
                            "source_text": movement[0],
                        },
                        {
                            "key": "movement_speed",
                            "record_type": "analysis",
                            "minimum": float(movement[2]),
                            "maximum": float(movement[3] or movement[2]),
                            "unit": "kt",
                            "source_text": movement[0],
                        },
                    ]
                )
            systems.append(
                {
                    "source_feature_key": key,
                    "name": f"Tropical wave along {axis[1]}{axis[2].upper()}",
                    "feature_type": "tropical_wave",
                    "narrative": body,
                    "facts": wave_facts,
                }
            )
            low = re.search(
                r"(?:a[n]? )?(\d{3,4}) (?:mb|hpa) low(?: pressure)?(?: (?:area|center|centre))?.*?(?:near|at) (\d+(?:\.\d+)?)([NS])\s*(\d+(?:\.\d+)?)([EW])",
                body,
                re.I,
            )
            if low:
                low_facts = [
                    {
                        "key": "pressure",
                        "record_type": "analysis",
                        "value": float(low[1]),
                        "unit": "hPa",
                        "source_text": low[0],
                    }
                ]
                for field, value, hemisphere, unit in [
                    ("latitude", low[2], low[3], "degrees_north"),
                    ("longitude", low[4], low[5], "degrees_east"),
                ]:
                    low_facts.append(
                        {
                            "key": field,
                            "record_type": "analysis",
                            "value": float(value)
                            * (-1 if hemisphere.upper() in {"S", "W"} else 1),
                            "unit": unit,
                            "qualifier": "near",
                            "source_text": low[0],
                        }
                    )
                systems.append(
                    {
                        "source_feature_key": key + "-low",
                        "parent_feature_key": key,
                        "name": f"Low near {low[2]}{low[3]} {low[4]}{low[5]}",
                        "feature_type": "low_pressure_centre",
                        "narrative": low[0],
                        "facts": low_facts,
                    }
                )
    text = decoded.get("text", "")
    # TCM carries explicitly labelled numeric fields. Never derive them from an image.
    facts = []
    patterns = [
        ("pressure", r"ESTIMATED MINIMUM CENTRAL PRESSURE\s+(\d+)\s+MB", "hPa"),
        ("maximum_wind", r"MAX SUSTAINED WINDS\s+(\d+)\s+KT", "kt"),
        ("gust", r"GUSTS TO\s+(\d+)\s+KT", "kt"),
    ]
    for key, pattern, unit in patterns:
        match = re.search(pattern, text, re.I)
        if match:
            facts.append(
                {
                    "key": key,
                    "record_type": "analysis",
                    "value": float(match[1]),
                    "unit": unit,
                    "source_text": match[0],
                }
            )
    position = re.search(
        r"CENTER LOCATED NEAR\s+(\d+(?:\.\d+)?)([NS])\s+(\d+(?:\.\d+)?)([EW])",
        text,
        re.I,
    )
    if position:
        for key, value, direction, unit in (
            ("latitude", position[1], position[2], "degrees_north"),
            ("longitude", position[3], position[4], "degrees_east"),
        ):
            facts.append(
                {
                    "key": key,
                    "record_type": "analysis",
                    "value": float(value)
                    * (-1 if direction.upper() in {"S", "W"} else 1),
                    "unit": unit,
                    "qualifier": "near",
                    "source_text": position[0],
                }
            )
    movement = re.search(
        r"PRESENT MOVEMENT TOWARD THE (.+?) OR\s+(\d+) DEGREES AT\s+(\d+) KT",
        text,
        re.I,
    )
    if movement:
        facts.extend(
            [
                {
                    "key": "movement_direction",
                    "record_type": "analysis",
                    "description": movement[1],
                    "source_text": movement[0],
                },
                {
                    "key": "movement_speed",
                    "record_type": "analysis",
                    "value": float(movement[3]),
                    "unit": "kt",
                    "source_text": movement[0],
                },
            ]
        )
    periods = []
    for zone in decoded.get("zones", []):
        for match in re.finditer(
            r"^\.([A-Z][A-Z 0-9]+)\.{3}(.+?)(?=^\.[A-Z]|\Z)", zone["text"], re.M | re.S
        ):
            body = " ".join(match[2].split())
            period_facts = []
            wind = re.search(
                r"\b(N|NE|E|SE|S|SW|W|NW) winds? (\d+)(?: to (\d+))? kt\b", body, re.I
            )
            sea = re.search(r"\bSeas (\d+)(?: to (\d+))? ft\b", body, re.I)
            if wind:
                period_facts.extend(
                    [
                        {
                            "key": "wind_direction",
                            "description": wind[1].upper(),
                            "source_text": wind[0],
                            "record_type": "forecast",
                        },
                        {
                            "key": "wind_speed",
                            "minimum": float(wind[2]),
                            "maximum": float(wind[3] or wind[2]),
                            "unit": "kt",
                            "source_text": wind[0],
                            "record_type": "forecast",
                        },
                    ]
                )
            if sea:
                period_facts.append(
                    {
                        "key": "wave_height",
                        "minimum": float(sea[1]),
                        "maximum": float(sea[2] or sea[1]),
                        "unit": "ft",
                        "source_text": sea[0],
                        "record_type": "forecast",
                    }
                )
            periods.append(
                {
                    "zone_id": zone["zone_id"],
                    "label": match[1],
                    "text": body,
                    "facts": period_facts,
                }
            )
    return {"systems": systems, "facts": facts, "marine_periods": periods}
