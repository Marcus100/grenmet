import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError, URLError

from gms_ingest import collector, discovery, registry, storage, text
from gms_ingest.download import Downloader, SafeRedirect, retry_delay


def feed(body, code="TWDAT"):
    return (
        f"<rss><channel><item><title>Test</title><pubDate>Sat, 05 Sep 2026 11:00:00 GMT</pubDate><description><![CDATA[ABNT20 KNHC 051100<br>{code}<br>{body}]]></description></item></channel></rss>"
    ).encode()


OUTLOOK = feed(
    "For the North Atlantic...Caribbean Sea and the Gulf of America:<br><br>Tropical cyclone formation is not expected during the next 7 days.<br><br>$$",
    "TWOAT",
)


class FixtureDownloader:
    data = {}

    def __init__(self, root, cache):
        self.root, self.cache = root, cache
        (root / "objects").mkdir(exist_ok=True)

    def fetch(self, product):
        value = self.data.get(
            product.id,
            feed("...CARIBBEAN SEA...<br>Fresh trades.", product.code or "TWDAT"),
        )
        if isinstance(value, Exception):
            raise value
        sha = hashlib.sha256(value).hexdigest()
        path = self.root / "objects" / sha
        path.write_bytes(value)
        return {
            "sha256": sha,
            "raw_file": str(path.relative_to(self.root)),
            "retrieved_at": storage.utc_now(),
            "url": product.url,
        }


class PipelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        FixtureDownloader.data = {"storms": b'{"activeStorms":[]}', "outlook": OUTLOOK}

    def run_collection(self):
        return collector.collect(
            self.root, {"text", "storms"}, downloader_factory=FixtureDownloader
        )

    def test_partial_publication_and_reuse(self):
        success, first = self.run_collection()
        self.assertTrue(success)
        previous = storage.read_json(self.root / "latest.json")
        count = len(list((self.root / "objects").iterdir()))
        FixtureDownloader.data["twdat"] = URLError("offline")
        success, second = self.run_collection()
        self.assertFalse(success)
        index = storage.read_json(self.root / "latest.json")
        self.assertEqual(
            index["products"]["twdat"]["decoded_file"],
            previous["products"]["twdat"]["decoded_file"],
        )
        self.assertEqual(index["products"]["twdat"]["status"], "failed")
        self.assertEqual(index["products"]["offnt3"]["status"], "success")
        self.assertEqual(len(list((self.root / "objects").iterdir())), count)
        self.assertTrue(
            (first / "manifest.json").exists() and (second / "manifest.json").exists()
        )

    def test_inactive_storm_and_v1_archive_survive(self):
        historic = self.root / "old-run"
        historic.mkdir()
        (historic / "normalized.json").write_text('{"schema_version":1}')
        storage.atomic_json(
            self.root / "latest.json",
            {
                "products": {
                    "old": {
                        "storm_id": "al012026",
                        "group": "storms",
                        "status": "success",
                    }
                }
            },
        )
        self.run_collection()
        self.assertEqual(
            storage.read_json(self.root / "latest.json")["products"]["old"]["status"],
            "inactive",
        )
        self.assertTrue((historic / "normalized.json").exists())

    def test_raw_survives_decode_failure(self):
        FixtureDownloader.data["twdat"] = b"<html>Not a feed</html>"
        self.assertFalse(self.run_collection()[0])
        product = storage.read_json(self.root / "latest.json")["products"]["twdat"]
        self.assertEqual(product["collection_status"], "success")
        self.assertEqual(product["decoding_status"], "failed")
        self.assertTrue((self.root / product["source"]["raw_file"]).exists())

    def test_sections_zones_and_midnight(self):
        result = text.bulletin(
            feed("...CARIBBEAN SEA...<br>Wind<br>...NEW SECTION...<br>Keep this"),
            "TWDAT",
        )
        self.assertEqual(
            [s["heading"] for s in result["sections"]], ["CARIBBEAN SEA", "NEW SECTION"]
        )
        self.assertEqual(
            text.zones("AMZ001-051200-\nSynopsis\nAMZ058-051200-\nForecast")[1][
                "zone_id"
            ],
            "AMZ058",
        )
        self.assertEqual(
            text.issue_time("ABNT20 KNHC 312359", "2026-09-01T00:05:00+00:00"),
            "2026-08-31T23:59:00+00:00",
        )

    def test_discovery_scope(self):
        storms = [
            {
                "id": "al012026",
                "forecastAdvisory": {"url": registry.BASE + "/text/MIATCMAT1.shtml"},
                "forecastTrack": None,
            }
        ]
        self.assertEqual(len(discovery.storm_products(storms, {"storms"})), 1)
        self.assertFalse(registry.allowed_url("https://example.com/text/a"))
        self.assertFalse(registry.allowed_url(registry.BASE + "/archive/2020/"))
        self.assertFalse(registry.allowed_url(registry.BASE + "/text/../archive/"))
        with self.assertRaises(ValueError):
            discovery.make_product("https://localhost/private.kmz", "bad", "maps")

    def test_latest_active_storm_grids_only(self):
        parent = discovery.grid_indexes([{"id": "al012026"}])[1]
        html = "".join(
            f'<a href="{name}">{name}</a>'
            for name in (
                "AL012026_TOA_TOD_34kt_adv001.grib2",
                "AL012026_TOA_TOD_34kt_adv012.grib2",
                "AL022026_TOA_TOD_34kt_adv013.grib2",
                "WP012026_TOA_TOD_34kt_adv020.grib2",
            )
        )
        result = discovery.indexed_grids(html, parent, [{"id": "al012026"}])
        self.assertEqual(len(result), 1)
        self.assertTrue(result[0].url.endswith("adv012.grib2"))
        self.assertEqual(result[0].storm_id, "al012026")
        self.assertEqual(discovery.grid_indexes([]), [])

    def test_removed_children_inactive_only_after_parent_success(self):
        storage.atomic_json(
            self.root / "latest.json",
            {
                "products": {
                    "removed": {
                        "parent_id": "outlook",
                        "group": "storms",
                        "active": True,
                        "status": "success",
                    }
                }
            },
        )
        FixtureDownloader.data["outlook"] = URLError("offline")
        self.run_collection()
        self.assertTrue(
            storage.read_json(self.root / "latest.json")["products"]["removed"][
                "active"
            ]
        )
        FixtureDownloader.data["outlook"] = OUTLOOK
        self.run_collection()
        self.assertFalse(
            storage.read_json(self.root / "latest.json")["products"]["removed"][
                "active"
            ]
        )


class DownloadTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.product = registry.Product(
            "test", "text", registry.BASE + "/xml/TWDAT.xml", "bulletin"
        )

    def response(self, data):
        response = MagicMock()
        response.__enter__.return_value = response
        stream = io.BytesIO(data)
        response.read.side_effect = stream.read
        response.status = 200
        response.headers = {"ETag": "tag"}
        return response

    @patch("gms_ingest.download.time.sleep")
    def test_retry_conditional_and_same_run_dedup(self, sleep):
        opener = MagicMock()
        opener.open.side_effect = [URLError("offline"), self.response(b"test")]
        cache = {}
        downloader = Downloader(self.root, cache, opener)
        first = downloader.fetch(self.product)
        self.assertEqual(downloader.fetch(self.product), first)
        self.assertEqual(opener.open.call_count, 2)
        opener.open.side_effect = HTTPError(
            self.product.url, 304, "unchanged", {}, None
        )
        second = Downloader(self.root, cache, opener).fetch(self.product)
        self.assertEqual(first["sha256"], second["sha256"])
        self.assertEqual(second["http_status"], 304)

    def test_size_limit_and_atomic_publication(self):
        opener = MagicMock()
        opener.open.return_value = self.response(b"too much")
        with self.assertRaises(ValueError):
            Downloader(self.root, {}, opener, budget=2).fetch(self.product)
        self.assertEqual(list((self.root / "objects").iterdir()), [])
        target = self.root / "latest.json"
        target.write_text("previous")
        with patch.object(Path, "replace", side_effect=OSError("interrupted")):
            with self.assertRaises(OSError):
                storage.atomic_json(target, {})
        self.assertEqual(target.read_text(), "previous")

    def test_corrupt_cache_is_repaired(self):
        opener = MagicMock()
        opener.open.return_value = self.response(b"original")
        cache = {}
        first = Downloader(self.root, cache, opener).fetch(self.product)
        (self.root / first["raw_file"]).write_bytes(b"damaged")
        opener.open.side_effect = [
            HTTPError(self.product.url, 304, "unchanged", {}, None),
            self.response(b"original"),
        ]
        Downloader(self.root, cache, opener).fetch(self.product)
        self.assertEqual((self.root / first["raw_file"]).read_bytes(), b"original")

    def test_retry_after_and_redirect(self):
        self.assertEqual(retry_delay("3", 0), 3)
        with self.assertRaises(ValueError):
            retry_delay("120", 0)
        with self.assertRaises(ValueError):
            SafeRedirect().redirect_request(
                None, None, 302, "", {}, "https://localhost/private"
            )
