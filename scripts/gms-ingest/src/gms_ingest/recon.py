"""NHC HDOB, labelled vortex, and WMO TEMP DROP observations.

References: NHC HDOB specification and NOAA AOML TEMP DROP format guide.
Original code groups are retained alongside decoded values.
"""

import re
from datetime import UTC, datetime, timedelta


def number(value, scale=1):
    if not value or "/" in value or value in {"NA", "999", "9999", "99999"}:
        return None
    return int(value) * scale


def latlon(value):
    if not re.fullmatch(r"\d{4,5}[NSEW]", value):
        raise ValueError("Invalid aircraft position")
    minutes = int(value[-3:-1])
    degrees = int(value[:-3])
    if minutes >= 60 or degrees > (90 if value[-1] in "NS" else 180):
        raise ValueError("Aircraft position out of range")
    return (degrees + minutes / 60) * (-1 if value[-1] in "SW" else 1)


def nearest_day(reference, day, hour, minute=0, second=0):
    ref = datetime.fromisoformat(reference.replace("Z", "+00:00"))
    candidates = []
    for offset in range(-31, 32):
        date = ref + timedelta(days=offset)
        if date.day == day:
            candidates.append(
                date.replace(hour=hour, minute=minute, second=second, microsecond=0)
            )
    if not candidates:
        raise ValueError("Invalid observation day")
    return min(candidates, key=lambda date: abs(date - ref)).astimezone(UTC).isoformat()


def hdob(body):
    header = re.search(r"^(.+?)\s+HDOB\s+(\d+)\s+(\d{8})\s*$", body, re.M)
    if not header:
        raise ValueError("HDOB mission/date header missing")
    day = datetime.strptime(header[3], "%Y%m%d").replace(tzinfo=UTC)
    previous = None
    observations = []
    for line in body[header.end() :].splitlines():
        if not re.match(r"^\d{6}\s", line):
            continue
        fields = line.split()
        if len(fields) != 13:
            raise ValueError("Expected 13 HDOB observation fields")
        (
            clock,
            latitude,
            longitude,
            pressure,
            height,
            surface,
            temperature,
            dewpoint,
            wind,
            peak,
            sfmr,
            rain,
            flags,
        ) = fields
        observed = day.replace(
            hour=int(clock[:2]), minute=int(clock[2:4]), second=int(clock[4:])
        )
        if previous and observed < previous:
            day += timedelta(days=1)
            observed += timedelta(days=1)
        previous = observed
        p = number(pressure, 0.1)
        if p is not None and p < 100:
            p += 1000
        surface_value = number(surface, 0.1 if p is not None and p >= 550 else 1)
        surface_kind = (
            "extrapolated_surface_pressure_hpa"
            if p is not None and p >= 550
            else "d_value_m"
            if p is not None
            else "unknown"
        )
        if (
            surface_value is not None
            and surface_kind == "extrapolated_surface_pressure_hpa"
            and surface_value < 100
        ):
            surface_value += 1000
        if (
            surface_value is not None
            and surface_kind == "d_value_m"
            and surface_value >= 5000
        ):
            surface_value = -(surface_value - 5000)
        observations.append(
            {
                "observed_at": observed.isoformat(),
                "latitude": latlon(latitude),
                "longitude": latlon(longitude),
                "flight_level_pressure_hpa": p,
                "geopotential_height_m": number(height),
                "surface_or_d_value": {"kind": surface_kind, "value": surface_value},
                "temperature_c": number(temperature, 0.1),
                "dewpoint_c": number(dewpoint, 0.1),
                "flight_level_wind_direction_deg": number(wind[:3]),
                "flight_level_wind_speed_kt": number(wind[3:]),
                "peak_flight_level_wind_kt": number(peak),
                "sfmr_surface_wind_kt": number(sfmr),
                "sfmr_rain_rate_mm_h": number(rain),
                "quality_flags": flags,
                "raw_groups": fields,
            }
        )
    if not observations:
        raise ValueError("No HDOB observations")
    return {
        "mission": header[1].strip(),
        "message_number": int(header[2]),
        "observations": observations,
    }


def vortex(body, reference):
    fields = {
        match[1]: match[2].strip()
        for match in re.finditer(
            r"^([A-Z])\.\s*(.*?)(?=^[A-Z]\.\s|\Z)", body, re.M | re.S
        )
    }
    if not {"A", "B"} <= fields.keys():
        raise ValueError("Vortex time/position fields missing")
    clock = re.match(r"(\d{2})/(\d{2}):(\d{2}):(\d{2})Z", fields["A"])
    position = re.match(r"([\d.]+) deg ([NS])\s+([\d.]+) deg ([EW])", fields["B"])
    if not clock or not position:
        raise ValueError("Unsupported vortex time/position encoding")
    lat = float(position[1]) * (-1 if position[2] == "S" else 1)
    lon = float(position[3]) * (-1 if position[4] == "W" else 1)
    if not -90 <= lat <= 90 or not -180 <= lon <= 180:
        raise ValueError("Vortex position out of range")
    decoded = {
        "observed_at": nearest_day(reference, *map(int, clock.groups())),
        "latitude": lat,
        "longitude": lon,
    }
    for key, name, pattern in (
        ("C", "flight_level", r"(\d+) mb (\d+) m"),
        ("D", "minimum_pressure_hpa", r"(\d+) mb"),
        ("E", "centre_surface_wind", r"(\d+) deg (\d+) kt"),
        ("J", "inbound_surface_wind", r"(\d+) deg (\d+) kt"),
        ("N", "outbound_flight_level_wind", r"(\d+) deg (\d+) kt"),
    ):
        match = re.match(pattern, fields.get(key, ""))
        decoded[name] = (
            list(map(int, match.groups()))
            if match and len(match.groups()) > 1
            else int(match[1])
            if match
            else None
        )
    return {
        "fields": fields,
        "observation": decoded,
        "mission": fields.get("U"),
        "format": "labelled-vortex",
    }


def tempdew(code):
    if len(code) != 5:
        raise ValueError("Invalid TEMP temperature group")
    t = (
        None
        if "/" in code[:3]
        else int(code[:3]) / 10 * (-1 if int(code[2]) % 2 else 1)
    )
    d = None if "/" in code[3:] else int(code[3:])
    depression = None if d is None else d / 10 if d <= 50 else d - 50
    return {
        "temperature_c": t,
        "dewpoint_depression_c": depression,
        "dewpoint_c": t - depression
        if t is not None and depression is not None
        else None,
    }


def tempwind(code, knots):
    if len(code) != 5:
        raise ValueError("Invalid TEMP wind group")
    if "/" in code:
        return {
            "wind_direction_deg": None,
            "wind_speed": None,
            "wind_unit": "kt" if knots else "m/s",
        }
    direction = int(code[:2]) * 10
    speed = int(code[2:])
    if speed >= 500:
        direction += 5
        speed -= 500
    return {
        "wind_direction_deg": direction,
        "wind_speed": speed,
        "wind_unit": "kt" if knots else "m/s",
    }


def pressure(code, upper=False):
    if "/" in code:
        return None
    value = int(code)
    return value / 10 if upper else value + 1000 if value < 100 else value


def dropsonde(body, reference):
    sections = re.findall(r"(XX[ABCD]{2})\s+(.*?)(?==|\Z)", body, re.S)
    if not sections:
        raise ValueError("TEMP DROP sections missing")
    result = []
    mandatory = {
        "00": 1000,
        "92": 925,
        "85": 850,
        "70": 700,
        "50": 500,
        "40": 400,
        "30": 300,
        "25": 250,
        "20": 200,
        "15": 150,
        "10": 100,
    }
    for section, content in sections:
        tokens = content.split()
        if len(tokens) < 5 or not tokens[1].startswith("99"):
            raise ValueError("Invalid TEMP DROP header")
        day = int(tokens[0][:2])
        knots = day > 50
        if knots:
            day -= 50
        quadrant = int(tokens[2][0])
        if quadrant not in (1, 3, 5, 7):
            raise ValueError("Unsupported TEMP quadrant")
        lat = int(tokens[1][2:]) / 10 * (-1 if quadrant in (3, 5) else 1)
        lon = int(tokens[2][1:]) / 10 * (-1 if quadrant in (5, 7) else 1)
        upper = section in {"XXCC", "XXDD"}
        mandatory_section = section in {"XXAA", "XXCC"}
        levels = []
        i = 4
        wind_section = False
        while i < len(tokens):
            code = tokens[i]
            if code in {"31313", "51515", "61616", "62626"}:
                break
            if code == "21212":
                wind_section = True
                i += 1
                continue
            if len(code) != 5:
                raise ValueError("Invalid TEMP level group")
            if mandatory_section:
                prefix = code[:2]
                if code in {"88999", "77999", "66999"}:
                    i += 1
                    continue
                if prefix in {"77", "66"}:
                    if i + 1 >= len(tokens):
                        raise ValueError("Truncated maximum-wind group")
                    levels.append(
                        {
                            "kind": "maximum_wind",
                            "pressure_hpa": pressure(code[2:], upper),
                            **tempwind(tokens[i + 1], knots),
                            "raw_groups": tokens[i : i + 2],
                        }
                    )
                    i += 2
                    if i < len(tokens) and tokens[i].startswith("4"):
                        levels[-1]["shear_code"] = tokens[i]
                        i += 1
                    continue
                p = (
                    pressure(code[2:], upper)
                    if prefix in {"99", "88"}
                    else mandatory.get(prefix)
                )
                if upper and prefix not in {"99", "88"}:
                    p = int(prefix) if prefix.isdigit() else None
                if p is None:
                    raise ValueError("Unknown mandatory pressure level")
                wind_top = (
                    int(tokens[0][4]) * (10 if upper else 100)
                    if tokens[0][4].isdigit()
                    else None
                )
                has_wind = prefix in {"99", "88"} or (
                    wind_top is not None and p >= wind_top
                )
                count = 3 if has_wind else 2
                if i + count > len(tokens):
                    raise ValueError("Truncated mandatory level")
                level = {
                    "pressure_hpa": p,
                    "height_code": code[2:] if prefix not in {"99", "88"} else None,
                    "kind": "surface"
                    if prefix == "99"
                    else "tropopause"
                    if prefix == "88"
                    else "mandatory",
                    **tempdew(tokens[i + 1]),
                    "raw_groups": tokens[i : i + count],
                }
                if has_wind:
                    level.update(tempwind(tokens[i + 2], knots))
                levels.append(level)
                i += count
            else:
                if i + 1 >= len(tokens):
                    raise ValueError("Truncated significant level")
                levels.append(
                    {
                        "pressure_hpa": pressure(code[2:], upper),
                        "kind": "significant_wind"
                        if wind_section
                        else "significant_temperature",
                        **(
                            tempwind(tokens[i + 1], knots)
                            if wind_section
                            else tempdew(tokens[i + 1])
                        ),
                        "raw_groups": tokens[i : i + 2],
                    }
                )
                i += 2
        if not levels:
            raise ValueError("TEMP DROP has no decoded levels")
        launch = re.search(r"31313\s+\d{5}\s+8(\d{2})(\d{2})", content)
        observed = nearest_day(
            reference,
            day,
            int(launch[1]) if launch else int(tokens[0][2:4]),
            int(launch[2]) if launch else 0,
        )
        mission = re.search(r"61616\s+(.*?)(?=62626|\Z)", content, re.S)
        result.append(
            {
                "section": section,
                "observed_at": observed,
                "time_precision": "minute" if launch else "hour",
                "latitude": lat,
                "longitude": lon,
                "mission": " ".join(mission[1].split()) if mission else None,
                "levels": levels,
                "supplementary_groups": tokens[i:],
            }
        )
    return {"profiles": result}


def decode(kind, body, reference):
    if kind == "hdob":
        return hdob(body)
    if kind == "vortex":
        return vortex(body, reference)
    return dropsonde(body, reference)
