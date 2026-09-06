"""Explicit source scope; no recursive website crawling."""

from dataclasses import dataclass
from datetime import UTC, datetime
from urllib.parse import urlsplit

BASE = "https://www.nhc.noaa.gov"
GROUPS = {"text", "storms", "maps", "charts", "grids", "recon"}
DEFAULT_BBOX = (-65.0, 8.0, -55.0, 20.0)
LIMITS = {"grid": 1024**3, "image": 100 * 1024**2, "vector": 100 * 1024**2}
HOST_PATHS = {
    "www.nhc.noaa.gov": (
        "/CurrentStorms.json",
        "/index-at.xml",
        "/gis-at.xml",
        "/gtwo.xml",
        "/xml/",
        "/text/",
        "/storm_graphics/",
        "/gis/",
        "/xgtwo/",
        "/tafb_latest/",
        "/graphics_at",
        "/overview_atl/",
    ),
    "nhc.noaa.gov": ("/text/", "/storm_graphics/", "/gis/", "/xgtwo/"),
    "ftp.nhc.noaa.gov": ("/wsp/", "/toa/"),
    "ftp.nhc.ncep.noaa.gov": ("/wsp/", "/toa/"),
    "tgftp.nws.noaa.gov": ("/SL.us008001/ST.opnl/DF.gr2/DC.ndfd/AR.oceanic/",),
}


@dataclass(frozen=True)
class Product:
    id: str
    group: str
    url: str
    kind: str
    code: str | None = None
    storm_id: str | None = None
    optional: bool = False
    issued_at: str | None = None
    parent_id: str | None = None

    @property
    def limit(self):
        return LIMITS.get(self.kind, 10 * 1024**2)


def allowed_url(url):
    parts = urlsplit(url)
    return (
        parts.scheme == "https"
        and parts.port in (None, 443)
        and not parts.username
        and not parts.password
        and ".." not in parts.path
        and "%" not in parts.path
        and any(
            parts.path.startswith(prefix)
            for prefix in HOST_PATHS.get(parts.hostname, ())
        )
    )


def sources(groups, now=None):
    now = now or datetime.now(UTC)
    products = []
    if groups & {"text", "storms", "maps", "grids"}:
        products += [
            Product("storms", "storms", BASE + "/CurrentStorms.json", "storms"),
            Product("outlook", "text", BASE + "/index-at.xml", "outlook"),
        ]
    if "text" in groups:
        for code in ("TWDAT", "OFFNT3", "HSFAT2"):
            products.append(
                Product(
                    code.lower(), "text", f"{BASE}/xml/{code}.xml", "bulletin", code
                )
            )
    if "maps" in groups:
        products += [
            Product("gis-feed", "maps", BASE + "/gis-at.xml", "gis-feed"),
            Product("outlook-graphics", "maps", BASE + "/gtwo.xml", "graphics-feed"),
            Product(
                "outlook-areas",
                "maps",
                BASE + "/xgtwo/gtwo_atl.kmz",
                "vector",
                optional=True,
            ),
        ]
    if "charts" in groups:
        charts = ["WATL_latest.gif", "CAR_latest.gif", "atlsea_latestBW.gif"]
        for hours in (24, 48, 72):
            charts += [f"atl{hours}_latestBW.gif", f"atlsfc{hours}_latestBW.gif"]
        charts += [f"atl{hours}per_latest.gif" for hours in (48, 72)]
        hurricane_season = (5, 15) <= (now.month, now.day) <= (11, 30)
        charts += [
            "danger_atl_latestBW.gif" if hurricane_season else "hiwind_atl_latestBW.gif"
        ]
        products += [
            Product(
                "chart-" + name.split(".")[0],
                "charts",
                BASE + "/tafb_latest/" + name,
                "image",
            )
            for name in charts
        ]
    if "grids" in groups:
        for window in ("001-003", "004-007"):
            for field in ("wspd", "wdir", "wgust", "waveh", "wwa"):
                url = f"https://tgftp.nws.noaa.gov/SL.us008001/ST.opnl/DF.gr2/DC.ndfd/AR.oceanic/VP.{window}/ds.{field}.bin"
                products.append(
                    Product(f"grid-{window}-{field}", "grids", url, "grid", field)
                )
    if "recon" in groups:
        for name, file, kind in (
            ("plan-today", "MIAREPRPD_last.shtml", "text"),
            ("plan-tomorrow", "MIAREPRPD.shtml", "text"),
            ("hdob-usaf", "URNT15-USAF.shtml", "hdob"),
            ("hdob-noaa", "URNT15-NOAA.shtml", "hdob"),
            ("vortex", "MIAREPNT2.shtml", "vortex"),
            ("dropsonde", "MIAREPNT3.shtml", "dropsonde"),
        ):
            products.append(
                Product(
                    "recon-" + name,
                    "recon",
                    BASE + "/text/" + file,
                    kind,
                    optional=True,
                )
            )
    return products
