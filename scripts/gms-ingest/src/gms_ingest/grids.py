"""Stream GRIB messages into regional native-cell NetCDF datasets."""

import math


def decode(path, target, bbox):
    import eccodes as ec
    import numpy as np
    import xarray as xr

    def get(message, key, default=None):
        try:
            return ec.codes_get(message, key)
        except ec.CodesInternalError:
            return default

    west, south, east, north = bbox
    rows, metadata = [], []
    coordinates = None
    previous_grid = None
    with path.open("rb") as stream:
        while (message := ec.codes_grib_new_from_file(stream)) is not None:
            try:
                signature = get(message, "md5GridSection")
                if signature is None or signature != previous_grid:
                    lat = ec.codes_get_array(message, "latitudes")
                    lon = (ec.codes_get_array(message, "longitudes") + 180) % 360 - 180
                    mask = (
                        (lat >= south) & (lat <= north) & (lon >= west) & (lon <= east)
                    )
                    previous_grid = signature
                if not mask.any():
                    continue
                selected = (lat[mask], lon[mask])
                if coordinates is not None and not all(
                    np.array_equal(a, b)
                    for a, b in zip(coordinates, selected, strict=True)
                ):
                    raise ValueError("Mixed native grids within a product")
                coordinates = selected
                values = ec.codes_get_values(message)[mask].astype(float)
                missing = get(message, "missingValue")
                if missing is not None:
                    values[values == missing] = np.nan
                values[~np.isfinite(values)] = np.nan
                rows.append(values)
                metadata.append(
                    {
                        key: get(message, key)
                        for key in (
                            "shortName",
                            "name",
                            "units",
                            "centre",
                            "subCentre",
                            "dataDate",
                            "dataTime",
                            "validityDate",
                            "validityTime",
                            "stepRange",
                            "typeOfLevel",
                            "level",
                            "gridType",
                            "discipline",
                            "parameterCategory",
                            "parameterNumber",
                            "localTablesVersion",
                        )
                    }
                )
            finally:
                ec.codes_release(message)
    if not rows:
        raise ValueError("No GRIB cells within requested bounds")
    values = np.stack(rows)
    dataset = xr.Dataset(
        {"value": (("record", "cell"), values)},
        coords={
            "latitude": ("cell", coordinates[0]),
            "longitude": ("cell", coordinates[1]),
        },
        attrs={
            "bbox": list(bbox),
            "decoder_version": "2",
            "sampling": "native cells; no interpolation",
        },
    )
    for key in metadata[0]:
        dataset[key] = (
            "record",
            [str(row[key]) if row[key] is not None else "" for row in metadata],
        )
    dataset["latitude"].attrs["units"] = "degrees_north"
    dataset["longitude"].attrs["units"] = "degrees_east"
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = target.with_suffix(".tmp.nc")
    try:
        dataset.to_netcdf(
            temporary, engine="netcdf4", encoding={"value": {"zlib": True}}
        )
        temporary.replace(target)
    finally:
        dataset.close()
        temporary.unlink(missing_ok=True)
    return {
        "bbox": list(bbox),
        "cells": len(coordinates[0]),
        "records": metadata,
        "units": sorted({str(row["units"]) for row in metadata}),
        "note": "Hazard values retain source codes; no hazard severity is inferred.",
    }


def point(path, lat, lon):
    import numpy as np
    import xarray as xr

    with xr.open_dataset(path) as dataset:
        west, south, east, north = dataset.attrs["bbox"]
        if not west <= lon <= east or not south <= lat <= north:
            raise ValueError("Requested location is outside decoded coverage")
        radians = math.pi / 180
        phi = dataset.latitude.values * radians
        delta_phi = phi - lat * radians
        delta_lon = (dataset.longitude.values - lon) * radians
        a = (
            np.sin(delta_phi / 2) ** 2
            + math.cos(lat * radians) * np.cos(phi) * np.sin(delta_lon / 2) ** 2
        )
        distance = 6371.0088 * 2 * np.arcsin(np.sqrt(np.clip(a, 0, 1)))
        records = []
        for index in range(dataset.sizes["record"]):
            values = dataset.value.values[index]
            valid = np.isfinite(values)
            metadata = {
                key: str(dataset[key].values[index])
                for key in dataset.data_vars
                if key != "value"
            }
            if not valid.any():
                records.append({**metadata, "value": None, "status": "missing"})
                continue
            cell = int(np.argmin(np.where(valid, distance, np.inf)))
            records.append(
                {
                    **metadata,
                    "value": float(values[cell]),
                    "cell_latitude": float(dataset.latitude.values[cell]),
                    "cell_longitude": float(dataset.longitude.values[cell]),
                    "distance_km": float(distance[cell]),
                }
            )
        return records
