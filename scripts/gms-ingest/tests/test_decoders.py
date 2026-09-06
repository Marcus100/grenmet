import io
import tempfile
import unittest
import zipfile
from pathlib import Path

from gms_ingest import grids, maps, recon


class MapTests(unittest.TestCase):
    def test_geometry_attributes_and_timestamp(self):
        raw = b"""<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Track</name><TimeStamp><when>2026-09-05T00:00:00Z</when></TimeStamp><ExtendedData><Data name="wind"><value>50</value></Data></ExtendedData><LineString><coordinates>-61,12 -62,13</coordinates></LineString></Placemark></Document></kml>"""
        data, _ = maps.decode(raw, "https://www.nhc.noaa.gov/gis/test.kml")
        self.assertEqual(
            data["features"][0]["geometry"]["coordinates"],
            [[-61.0, 12.0], [-62.0, 13.0]],
        )
        self.assertEqual(data["features"][0]["properties"]["wind"], "50")
        legacy, _ = maps.decode(
            raw.replace(
                b"http://www.opengis.net/kml/2.2", b"http://earth.google.com/kml/2.1"
            ),
            "https://www.nhc.noaa.gov/gis/test.kml",
        )
        self.assertEqual(legacy["features"], data["features"])
        self.assertEqual(
            data["features"][0]["properties"]["when"], "2026-09-05T00:00:00Z"
        )

    def test_corrupt_and_unsafe_archives(self):
        with self.assertRaises(zipfile.BadZipFile):
            maps.decode(b"PKbroken", "https://www.nhc.noaa.gov/gis/test.zip")
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            archive.writestr("../bad.kml", "bad")
        with self.assertRaises(ValueError):
            maps.decode(stream.getvalue(), "https://www.nhc.noaa.gov/gis/test.zip")

    def test_shapefile(self):
        import shapefile
        from pyproj import CRS

        shp, shx, dbf = io.BytesIO(), io.BytesIO(), io.BytesIO()
        with shapefile.Writer(shp=shp, shx=shx, dbf=dbf) as writer:
            writer.field("NAME", "C")
            writer.point(-61.75, 12.05)
            writer.record("Grenada")
        stream = io.BytesIO()
        with zipfile.ZipFile(stream, "w") as archive:
            for suffix, buffer in (("shp", shp), ("shx", shx), ("dbf", dbf)):
                archive.writestr("test." + suffix, buffer.getvalue())
            archive.writestr("test.prj", CRS.from_epsg(4326).to_wkt())
        data, _ = maps.decode(
            stream.getvalue(), "https://www.nhc.noaa.gov/gis/test.zip"
        )
        self.assertEqual(data["features"][0]["properties"]["NAME"], "Grenada")


class ReconTests(unittest.TestCase):
    def test_hdob_units_missing_and_rollover(self):
        body = "AF302 0101A TEST HDOB 01 20260905\n235930 1200N 06130W 7093 03047 9333 +192 +134 133083 089 080 999 03\n000030 1200N 06130W 7093 03047 9333 +192 +134 999999 999 999 999 00\n$$"
        values = recon.hdob(body)["observations"]
        self.assertEqual(values[0]["longitude"], -61.5)
        self.assertAlmostEqual(values[0]["flight_level_pressure_hpa"], 709.3)
        self.assertEqual(values[0]["sfmr_surface_wind_kt"], 80)
        self.assertEqual(values[0]["quality_flags"], "03")
        self.assertIsNone(values[1]["flight_level_wind_speed_kt"])
        self.assertIn("2026-09-06", values[1]["observed_at"])

    def test_vortex(self):
        result = recon.vortex(
            "A. 01/00:05:00Z\nB. 12.50 deg N 061.50 deg W\nC. 850 mb 1449 m\nD. 1000 mb\nU. TEST OB 1",
            "2026-09-01T00:10:00+00:00",
        )
        self.assertEqual(result["observation"]["minimum_pressure_hpa"], 1000)
        self.assertEqual(result["observation"]["longitude"], -61.5)

    def test_tempdrop_temperature_wind_and_significant_levels(self):
        body = "XXAA 55139 99120 70615 08000 99013 27237 27515 00112 26036 27519 92798 23043 25522 85532 ///// 88999 77999 31313 09608 81320 61616 TEST OB 1 =\nXXBB 55138 99120 70615 08000 00013 27237 11982 24626 21212 00013 27515 11998 28019 31313 09608 81320 61616 TEST OB 1 ="
        profiles = recon.dropsonde(body, "2026-09-05T13:37:00+00:00")["profiles"]
        first = profiles[0]["levels"][0]
        self.assertEqual(first["pressure_hpa"], 1013)
        self.assertEqual(first["wind_direction_deg"], 275)
        self.assertEqual(first["wind_speed"], 15)
        self.assertAlmostEqual(first["dewpoint_c"], 23.5)
        self.assertEqual(profiles[1]["levels"][-1]["kind"], "significant_wind")
        self.assertEqual(recon.tempdew("05966")["temperature_c"], -5.9)
        self.assertIsNone(profiles[0]["levels"][-1]["temperature_c"])


class GridTests(unittest.TestCase):
    def test_real_grib_decode_and_point(self):
        import eccodes as ec
        import numpy as np

        with tempfile.TemporaryDirectory() as folder:
            source, target = Path(folder) / "test.grib", Path(folder) / "grid.nc"
            handle = ec.codes_grib_new_from_samples("regular_ll_sfc_grib2")
            try:
                for key, value in {
                    "Ni": 3,
                    "Nj": 2,
                    "latitudeOfFirstGridPointInDegrees": 13.0,
                    "longitudeOfFirstGridPointInDegrees": 298.0,
                    "latitudeOfLastGridPointInDegrees": 12.0,
                    "longitudeOfLastGridPointInDegrees": 300.0,
                    "iDirectionIncrementInDegrees": 1.0,
                    "jDirectionIncrementInDegrees": 1.0,
                    "dataDate": 20260905,
                    "dataTime": 0,
                }.items():
                    ec.codes_set(handle, key, value)
                ec.codes_set_values(
                    handle, np.array([10.0, 20.0, 30.0, 40.0, 50.0, 60.0])
                )
                with source.open("wb") as stream:
                    ec.codes_write(handle, stream)
            finally:
                ec.codes_release(handle)
            decoded = grids.decode(source, target, (-62, 12, -60, 13))
            self.assertEqual(decoded["cells"], 6)
            result = grids.point(target, 12.0, -61.0)
            self.assertEqual(result[0]["value"], 50.0)
            self.assertEqual(result[0]["distance_km"], 0.0)
            with self.assertRaises(ValueError):
                grids.point(target, 30, -61)
