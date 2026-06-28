from typing import Any

from src.cap.schemas import CapAlertPublic, CapAreaPublic


def alerts_to_feature_collection(alerts: list[CapAlertPublic]) -> dict[str, Any]:
    features: list[dict[str, Any]] = []
    for alert in alerts:
        for info in alert.info:
            for area in info.areas:
                features.extend(_area_features(alert, area))
    return {"type": "FeatureCollection", "features": features}


def _area_features(alert: CapAlertPublic, area: CapAreaPublic) -> list[dict[str, Any]]:
    properties = {
        "id": str(alert.id),
        "identifier": alert.identifier,
        "headline": alert.info[0].headline if alert.info else alert.identifier,
        "event": alert.info[0].event if alert.info else None,
        "severity": alert.info[0].severity.value if alert.info else None,
        "urgency": alert.info[0].urgency.value if alert.info else None,
        "certainty": alert.info[0].certainty.value if alert.info else None,
        "areaDesc": area.area_desc,
        "xmlUrl": alert.xml_url,
    }
    features: list[dict[str, Any]] = []

    if area.geometry:
        features.append(_feature(area.geometry, properties))
    for polygon in area.polygons:
        features.append(
            _feature({"type": "Polygon", "coordinates": [polygon]}, properties)
        )
    for multipolygon in area.multipolygons:
        features.append(
            _feature({"type": "MultiPolygon", "coordinates": multipolygon}, properties)
        )
    for circle in area.circles:
        lon = circle.get("lon", circle.get("longitude", 0))
        lat = circle.get("lat", circle.get("latitude", 0))
        radius = circle.get("radius", circle.get("radius_km", 0))
        circle_properties = {**properties, "radiusKm": radius}
        features.append(
            _feature(
                {"type": "Point", "coordinates": [lon, lat]},
                circle_properties,
            )
        )
    if not features:
        features.append(_feature(None, properties))
    return features


def _feature(
    geometry: dict[str, Any] | None, properties: dict[str, Any]
) -> dict[str, Any]:
    return {"type": "Feature", "geometry": geometry, "properties": properties}
