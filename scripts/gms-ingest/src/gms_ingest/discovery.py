"""One-level product discovery from official indexes and storm metadata."""

import hashlib
import re
from html.parser import HTMLParser
from urllib.parse import urljoin, urlsplit

from .registry import BASE, Product, allowed_url


class Links(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        url = (
            attrs.get("src")
            if tag == "img"
            else attrs.get("href")
            if tag in {"a", "area"}
            else None
        )
        if url:
            self.links.append(url)


def kind_for(url):
    path = urlsplit(url).path.lower()
    if path.endswith((".kmz", ".kml", ".zip")):
        return "vector"
    if path.endswith((".png", ".gif", ".jpg", ".jpeg")):
        return "image"
    if path.endswith((".grb", ".grib", ".grb2", ".grib2", ".bin")):
        return "grid"
    if path.endswith((".shtml", ".html", ".txt")):
        return "text"
    return None


def make_product(url, prefix, group, storm_id=None, issued_at=None):
    url = urljoin(BASE, url).replace("http://", "https://", 1)
    if not allowed_url(url):
        raise ValueError(f"Discovered URL outside source registry: {url}")
    kind = kind_for(url)
    if not kind:
        return None
    return Product(
        prefix + "-" + hashlib.sha256(url.encode()).hexdigest()[:16],
        group,
        url,
        kind,
        storm_id=storm_id,
        issued_at=issued_at,
    )


def storm_products(storms, groups):
    result = []
    for storm in storms:
        for name, product in storm.items():
            if not isinstance(product, dict):
                continue
            for field, value in product.items():
                if not isinstance(value, str) or not value.startswith(
                    ("https://", "http://")
                ):
                    continue
                kind = kind_for(value)
                group = (
                    "storms"
                    if kind == "text"
                    else "grids"
                    if kind == "grid"
                    else "maps"
                )
                if name == "forecastGraphics":
                    group = "maps"
                if group not in groups:
                    continue
                found = make_product(
                    value,
                    storm["id"] + "-" + name + "-" + field,
                    group,
                    storm["id"],
                    product.get("issuance"),
                )
                if found:
                    # IDs identify the product, not the changing advisory URL.
                    found = Product(
                        storm["id"] + "-" + name + "-" + field,
                        group,
                        found.url,
                        found.kind,
                        storm_id=storm["id"],
                        issued_at=product.get("issuance"),
                    )
                    if name == "forecastGraphics":
                        found = Product(
                            found.id,
                            group,
                            found.url,
                            "storm-page",
                            storm_id=storm["id"],
                            issued_at=found.issued_at,
                        )
                    result.append(found)
    return result


def advisory_products(items):
    result = []
    for item in items:
        code = re.search(
            r"\b(?:TCPAT|TCMAT|TCDAT|PWSAT|TCVAT)\d\b", item.get("text", "")
        )
        storm = re.search(r"\bAL\d{6}\b", item.get("text", ""), re.I)
        if not code or not item.get("url"):
            continue
        found = make_product(item["url"], "advisory", "storms")
        if found:
            result.append(
                Product(
                    "rss-" + code[0].lower(),
                    "storms",
                    found.url,
                    "text",
                    storm_id=storm[0].lower() if storm else None,
                    issued_at=item.get("issued_at"),
                )
            )
    return result


def feed_products(items, graphical=False):
    products = []
    for item in items:
        if graphical and item.get("title") != "Atlantic Tropical Weather Outlook":
            continue
        links = Links()
        links.feed(item.get("html", ""))
        urls = links.links + item.get("enclosures", [])
        if item.get("url"):
            urls.append(item["url"])
        for url in urls:
            if re.search(r"(?:ep|cp)\d{6}|(?:pac|cpac)", url, re.I):
                continue
            kind = kind_for(url)
            if kind not in {"vector", "image", "grid"}:
                continue
            found = make_product(
                url,
                "outlook" if graphical else "gis",
                "maps" if kind != "grid" else "grids",
                issued_at=item.get("issued_at"),
            )
            if found:
                products.append(found)
    return products


def page_products(raw, parent):
    links = Links()
    links.feed(raw.decode("utf-8", errors="replace"))
    result = []
    for url in links.links:
        url = urljoin(parent.url, url)
        if parent.storm_id and parent.storm_id.lower() not in url.lower():
            continue
        if kind_for(url) not in {"image", "vector", "grid"}:
            continue
        found = make_product(url, parent.id, "maps", parent.storm_id, parent.issued_at)
        if found:
            result.append(found)
    return result


def grid_indexes(storms):
    if not storms:
        return []
    return [
        Product(
            "storm-grid-" + name,
            "grids",
            "https://ftp.nhc.ncep.noaa.gov/" + path,
            "grid-index",
        )
        for name, path in (("probability", "wsp/download/"), ("arrival", "toa/"))
    ]


def indexed_grids(html, parent, storms):
    """Select only the newest advertised cycle/advisory, never backfill directories."""
    links = Links()
    links.feed(html)
    active = {storm["id"].upper() for storm in storms}
    latest = {}
    for link in links.links:
        filename = urlsplit(link).path.rsplit("/", 1)[-1]
        match = re.fullmatch(
            r"(AL\d{6})_(TOA_TOD_\d+kt)_adv(\d+)\.grib2", filename, re.I
        )
        if match and match[1].upper() in active:
            key, order, storm = (
                match[1].lower() + "-" + match[2].lower(),
                int(match[3]),
                match[1].lower(),
            )
        else:
            match = re.fullmatch(
                r"WSPtpcprblty\.(\d{10})\.g231\.2\.gribpreliminary", filename
            )
            if not match or not active:
                continue
            key, order, storm = "wind-probability-preliminary", int(match[1]), None
        url = urljoin(parent.url, link)
        if allowed_url(url) and (key not in latest or order > latest[key][0]):
            latest[key] = (
                order,
                Product("grid-" + key, "grids", url, "grid", storm_id=storm),
            )
    return [value[1] for value in latest.values()]
