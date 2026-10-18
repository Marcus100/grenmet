"""Labels and attribution shared by the models-guidance routes."""

GUIDANCE_APP_KEY = "gmsdash"

GUIDANCE_DISCLAIMER = "Raw model guidance, not an official GMS forecast."

MODEL_KEYS: tuple[str, ...] = ("ifs", "aifs", "gfs")

MODEL_LABELS: dict[str, str] = {
    "ifs": "ECMWF IFS (HRES)",
    "aifs": "ECMWF AIFS Single",
    "gfs": "NOAA GFS",
}

ATTRIBUTION: dict[str, str] = {
    "ifs": (
        "Contains ECMWF open data (IFS, 0.25 degrees), licensed CC-BY-4.0. "
        "Source: ECMWF; reprocessed to a point time series."
    ),
    "aifs": (
        "Contains ECMWF open data (AIFS Single, 0.25 degrees), licensed CC-BY-4.0. "
        "Source: ECMWF; reprocessed to a point time series."
    ),
    "gfs": (
        "NOAA/NCEP Global Forecast System (0.25 degrees), "
        "US Government work in the public domain."
    ),
}

#: Series keys stored per point, with their API units.
VARIABLES: dict[str, str] = {
    "temperature_c": "degC",
    "wind_speed_ms": "m/s",
    "wind_direction_deg": "deg",
    "wind_gust_ms": "m/s",
    "precipitation_mm": "mm per interval",
    "mslp_hpa": "hPa",
    "cloud_cover_pct": "%",
}
