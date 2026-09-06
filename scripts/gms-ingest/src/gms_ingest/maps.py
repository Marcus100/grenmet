"""NHC vectors to WGS84 GeoJSON; overlays remain raster assets."""

import io
import json
import math
import xml.etree.ElementTree as ET
import zipfile
from pathlib import PurePosixPath
from urllib.parse import urljoin

from .registry import allowed_url

K = "{http://www.opengis.net/kml/2.2}"


def zip_members(raw):
    archive = zipfile.ZipFile(io.BytesIO(raw))
    members = archive.infolist()
    if len(members) > 200 or sum(item.file_size for item in members) > 200 * 1024**2:
        raise ValueError("Expanded archive exceeds limit")
    for item in members:
        path = PurePosixPath(item.filename)
        if path.is_absolute() or ".." in path.parts or "\\" in item.filename:
            raise ValueError("Unsafe archive member")
        if item.flag_bits & 1:
            raise ValueError("Encrypted archive unsupported")
    return archive


def coordinates(text):
    result = []
    for value in (text or "").split():
        point = [float(number) for number in value.split(",")]
        if len(point) not in (2, 3) or not all(
            math.isfinite(number) for number in point
        ):
            raise ValueError("Invalid KML coordinates")
        if not -180 <= point[0] <= 180 or not -90 <= point[1] <= 90:
            raise ValueError("KML coordinate outside WGS84")
        result.append(point)
    return result


def geometry(node):
    tag = node.tag.split("}")[-1]
    if tag in {"Point", "LineString", "LinearRing"}:
        points = coordinates(node.findtext(K + "coordinates"))
        if not points:
            raise ValueError("Geometry has no coordinates")
        return {
            "type": "Point" if tag == "Point" else "LineString",
            "coordinates": points[0] if tag == "Point" else points,
        }
    if tag == "Polygon":
        rings = [
            coordinates(ring.findtext(K + "coordinates"))
            for ring in node.findall(".//" + K + "LinearRing")
        ]
        if not rings or any(len(ring) < 4 or ring[0] != ring[-1] for ring in rings):
            raise ValueError("Invalid polygon rings")
        return {"type": "Polygon", "coordinates": rings}
    if tag == "MultiGeometry":
        return {
            "type": "GeometryCollection",
            "geometries": [geometry(child) for child in node],
        }
    raise ValueError(f"Unsupported vector geometry: {tag}")


def kml(raw, source_url, archive=None):
    root = ET.fromstring(raw)
    for node in root.iter():
        if node.tag.startswith("{http://earth.google.com/kml/2.1}"):
            node.tag = K + node.tag.split("}", 1)[1]
    if root.tag != K + "kml":
        raise ValueError("Expected KML 2.1 or 2.2")
    features, overlays, links, embedded = [], [], [], {}
    for placemark in root.findall(".//" + K + "Placemark"):
        props = {
            name: placemark.findtext(K + name)
            for name in ("name", "description", "styleUrl")
        }
        for data in placemark.findall(".//" + K + "Data"):
            props[data.get("name")] = data.findtext(K + "value")
        for data in placemark.findall(".//" + K + "SimpleData"):
            props[data.get("name")] = data.text
        for name in ("when", "begin", "end"):
            props[name] = placemark.findtext(".//" + K + name)
        geometries = [
            child
            for child in placemark
            if child.tag.split("}")[-1]
            in {"Point", "LineString", "Polygon", "MultiGeometry"}
        ]
        if not geometries:
            raise ValueError("Placemark without supported geometry")
        for node in geometries:
            features.append(
                {"type": "Feature", "properties": props, "geometry": geometry(node)}
            )
    for node in root.findall(".//" + K + "NetworkLink") + root.findall(
        ".//" + K + "GroundOverlay"
    ):
        href = node.findtext(".//" + K + "href")
        if not href:
            raise ValueError("KML asset link missing")
        if archive and href in archive.namelist():
            embedded[href] = archive.read(href)
            target = href
        else:
            target = urljoin(source_url, href)
            if not allowed_url(target):
                raise ValueError(f"KML linked asset outside registry: {target}")
            links.append(target)
        if node.tag == K + "GroundOverlay":
            overlays.append(
                {
                    "href": target,
                    "name": node.findtext(K + "name"),
                    "bounds": {
                        key: node.findtext(".//" + K + key)
                        for key in ("north", "south", "east", "west", "rotation")
                    },
                }
            )
    return {
        "type": "FeatureCollection",
        "features": features,
        "overlays": overlays,
        "links": list(dict.fromkeys(links)),
    }, embedded


def transform_coordinates(coords, transformer):
    if coords and isinstance(coords[0], (float, int)):
        return list(transformer.transform(*coords[:2])) + list(coords[2:])
    return [transform_coordinates(child, transformer) for child in coords]


def decode(raw, source_url):
    if not raw.startswith(b"PK"):
        return kml(raw, source_url)
    with zip_members(raw) as archive:
        kmls = [name for name in archive.namelist() if name.lower().endswith(".kml")]
        if kmls:
            result = {
                "type": "FeatureCollection",
                "features": [],
                "overlays": [],
                "links": [],
            }
            embedded = {}
            for name in kmls:
                part, assets = kml(archive.read(name), source_url, archive)
                for key in ("features", "overlays", "links"):
                    result[key].extend(part[key])
                embedded.update(assets)
            return result, embedded
        import shapefile
        from pyproj import CRS, Transformer

        features = []
        names = {name.lower(): name for name in archive.namelist()}
        for lower, name in names.items():
            if not lower.endswith(".shp"):
                continue
            base = lower[:-4]
            if base + ".prj" not in names or base + ".dbf" not in names:
                raise ValueError("Shapefile requires projection and attributes")
            crs = CRS.from_wkt(archive.read(names[base + ".prj"]).decode())
            transformer = Transformer.from_crs(crs, "EPSG:4326", always_xy=True)
            kwargs = {
                suffix: io.BytesIO(archive.read(names[base + "." + suffix]))
                for suffix in ("shp", "dbf", "shx")
                if base + "." + suffix in names
            }
            with shapefile.Reader(**kwargs) as reader:
                for record in reader.iterShapeRecords():
                    geom = record.shape.__geo_interface__
                    geom["coordinates"] = transform_coordinates(
                        geom["coordinates"], transformer
                    )
                    props = json.loads(json.dumps(record.record.as_dict(), default=str))
                    props["source_layer"] = PurePosixPath(name).stem
                    features.append(
                        {"type": "Feature", "geometry": geom, "properties": props}
                    )
        if not any(name.endswith(".shp") for name in names):
            raise ValueError("Archive contains no supported vectors")
        return {
            "type": "FeatureCollection",
            "features": features,
            "overlays": [],
            "links": [],
        }, {}
