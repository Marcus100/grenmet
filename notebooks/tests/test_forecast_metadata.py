"""Offline contract and integration tests for the actual GFS notebook helpers."""

import contextlib
import importlib.util
import io
import json
import tempfile
import unittest
from datetime import UTC, datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

GFS_DIR = Path(__file__).resolve().parents[1] / "models/noaa_gfs"
spec = importlib.util.spec_from_file_location(
    "forecast_metadata", GFS_DIR / "forecast_metadata.py"
)
assert spec is not None and spec.loader is not None
metadata_helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(metadata_helper)


def cell_source(index):
    notebook = json.loads((GFS_DIR / "download.ipynb").read_text())
    source = notebook["cells"][index]["source"]
    return "".join(source) if isinstance(source, list) else source


def execute_cell(source, filename, namespace):
    # Only execute version-controlled notebook cells with mocked I/O.
    exec(compile(source, filename, "exec"), namespace)  # noqa: S102


class ForecastMetadataTests(unittest.TestCase):
    def metadata(self, run, hours):
        return metadata_helper.build_forecast_metadata(
            run, "gfs", "pgrb2.0p25", ":TMP:2 m above ground:", hours
        )

    def test_different_runs_with_same_valid_time_keep_distinct_identity(self):
        first = self.metadata(datetime(2026, 1, 31, 18, tzinfo=UTC), [6])
        second = self.metadata(datetime(2026, 2, 1, tzinfo=UTC), [0])
        self.assertEqual(
            first["requested_forecasts"][0]["valid_time"],
            second["requested_forecasts"][0]["valid_time"],
        )
        self.assertNotEqual(first["initialization_time"], second["initialization_time"])
        self.assertNotEqual(first, second)

    def test_midnight_month_and_year_boundaries(self):
        cases = [
            (
                datetime(2026, 10, 12, 18, tzinfo=UTC),
                6,
                "2026-10-13T00:00:00Z",
            ),
            (datetime(2026, 1, 31, 18, tzinfo=UTC), 9, "2026-02-01T03:00:00Z"),
            (
                datetime(2026, 12, 31, 18, tzinfo=UTC),
                6,
                "2027-01-01T00:00:00Z",
            ),
        ]
        for run, hour, expected in cases:
            with self.subTest(run=run):
                self.assertEqual(
                    self.metadata(run, [hour])["requested_forecasts"],
                    [{"forecast_hour": hour, "valid_time": expected}],
                )

    def test_offset_is_normalized_to_utc(self):
        run = datetime(2026, 10, 12, 14, tzinfo=timezone(timedelta(hours=-4)))
        result = self.metadata(run, [0, 6])
        self.assertEqual(result["initialization_time"], "2026-10-12T18:00:00Z")
        self.assertEqual(
            result["requested_forecasts"][1]["valid_time"], "2026-10-13T00:00:00Z"
        )

    def test_naive_time_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "timezone"):
            self.metadata(
                datetime(2026, 10, 12, 18, tzinfo=UTC).replace(tzinfo=None), [6]
            )

    def test_invalid_forecast_hours_are_rejected(self):
        for hours in ([], [-1], [1.5], [True], ["6"]):
            with self.subTest(hours=hours), self.assertRaises(ValueError):
                self.metadata(datetime(2026, 10, 12, tzinfo=UTC), hours)

    def test_sidecar_contains_complete_schema_and_requested_filter(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "sfc_f024.grib2"
            metadata = self.metadata(datetime(2026, 10, 12, 18, tzinfo=UTC), [24])
            sidecar = metadata_helper.write_forecast_metadata(target, metadata)
            self.assertEqual(sidecar.name, "sfc_f024.grib2.metadata.json")
            self.assertEqual(
                json.loads(sidecar.read_text()),
                {
                    "schema_version": 1,
                    "model": "gfs",
                    "product": "pgrb2.0p25",
                    "initialization_time": "2026-10-12T18:00:00Z",
                    "requested_field_filter": ":TMP:2 m above ground:",
                    "requested_forecasts": [
                        {"forecast_hour": 24, "valid_time": "2026-10-13T18:00:00Z"}
                    ],
                },
            )
            self.assertEqual(list(Path(directory).iterdir()), [sidecar])

    def test_failed_atomic_replace_preserves_existing_json_and_cleans_temp(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "sfc.grib2"
            sidecar = metadata_helper.metadata_path(target)
            sidecar.write_text('{"previous": true}')
            with (
                patch.object(Path, "replace", side_effect=OSError("disk error")),
                self.assertRaises(metadata_helper.ForecastMetadataError),
            ):
                metadata_helper.write_forecast_metadata(
                    target,
                    self.metadata(datetime(2026, 10, 12, tzinfo=UTC), [0]),
                )
            self.assertEqual(json.loads(sidecar.read_text()), {"previous": True})
            self.assertEqual(list(Path(directory).iterdir()), [sidecar])

    def test_serialization_failure_leaves_no_partial_metadata(self):
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / "sfc.grib2"
            with self.assertRaises(metadata_helper.ForecastMetadataError):
                metadata_helper.write_forecast_metadata(target, {"invalid": object()})
            self.assertEqual(list(Path(directory).iterdir()), [])


class NotebookDownloadTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.output = Path(self.directory.name)
        self.run = datetime(2026, 1, 31, 18, tzinfo=UTC)
        self.requests = []
        self.fail_hour = None
        self.after_download = None
        owner = self

        class MockHerbie:
            def __init__(self, run, **options):
                self.run = run
                self.options = options

            def download(self, search, save_dir):
                owner.requests.append((self.run, self.options, search))
                hour = self.options["fxx"]
                if hour == owner.fail_hour:
                    raise OSError("download failed")
                target = save_dir / f"{self.options['model']}-{hour}.grib2"
                target.write_bytes(f"forecast-{hour};".encode())
                if owner.after_download is not None:
                    owner.after_download()
                return target

        self.namespace = {
            "Herbie": MockHerbie,
            "Path": Path,
            "UTC": UTC,
            "initialization_time": self.run,
            "output_dir": self.output,
            "ForecastMetadataError": metadata_helper.ForecastMetadataError,
            "build_forecast_metadata": metadata_helper.build_forecast_metadata,
            "remove_forecast_metadata": metadata_helper.remove_forecast_metadata,
            "write_forecast_metadata": metadata_helper.write_forecast_metadata,
        }
        # Execute the helper definitions from the notebook, avoiding network snapshots.
        execute_cell(
            cell_source(3).split("# Verification snapshots")[0],
            "download.ipynb:helpers",
            self.namespace,
        )
        self.quiet = contextlib.redirect_stdout(io.StringIO())
        self.quiet.__enter__()
        self.addCleanup(self.quiet.__exit__, None, None, None)

    def sidecar(self, target):
        return json.loads(metadata_helper.metadata_path(target).read_text())

    def test_single_step_matches_retrieval_run_and_filter(self):
        target = self.output / "sfc_f024.grib2"
        returned = self.namespace["download_step"](24, ":TMP:", target)
        self.assertEqual(returned, target)
        self.assertEqual(target.read_bytes(), b"forecast-24;")
        self.assertEqual(
            self.sidecar(target)["initialization_time"], "2026-01-31T18:00:00Z"
        )
        self.assertEqual(self.sidecar(target)["requested_field_filter"], ":TMP:")
        self.assertEqual(
            self.sidecar(target)["requested_forecasts"],
            [{"forecast_hour": 24, "valid_time": "2026-02-01T18:00:00Z"}],
        )
        self.assertEqual(
            self.requests,
            [
                (
                    self.run.replace(tzinfo=None),
                    {
                        "model": "gfs",
                        "product": "pgrb2.0p25",
                        "fxx": 24,
                        "verbose": False,
                    },
                    ":TMP:",
                )
            ],
        )

    def test_batch_uses_fixed_run_even_if_global_changes_during_download(self):
        target = self.output / "sfc_f000-f120_3h.grib2"
        self.after_download = lambda: self.namespace.update(
            initialization_time=self.run + timedelta(hours=6)
        )
        self.namespace["download_batch"](iter([0, 3, 6]), ":TMP:|:UGRD:", target)
        self.assertEqual(target.read_bytes(), b"forecast-0;forecast-3;forecast-6;")
        self.assertEqual(
            [request[0] for request in self.requests],
            [self.run.replace(tzinfo=None)] * 3,
        )
        self.assertEqual(
            self.sidecar(target)["initialization_time"], "2026-01-31T18:00:00Z"
        )
        self.assertEqual(
            self.sidecar(target)["requested_forecasts"],
            [
                {"forecast_hour": 0, "valid_time": "2026-01-31T18:00:00Z"},
                {"forecast_hour": 3, "valid_time": "2026-01-31T21:00:00Z"},
                {"forecast_hour": 6, "valid_time": "2026-02-01T00:00:00Z"},
            ],
        )

    def test_offset_run_retrieval_and_metadata_both_use_utc(self):
        self.namespace["initialization_time"] = datetime(
            2026, 1, 31, 14, tzinfo=timezone(timedelta(hours=-4))
        )
        target = self.output / "sfc.grib2"
        self.namespace["download_step"](6, ":TMP:", target)
        self.assertEqual(self.requests[0][0], self.run.replace(tzinfo=None))
        self.assertEqual(
            self.sidecar(target)["initialization_time"], "2026-01-31T18:00:00Z"
        )

    def test_actual_snapshot_cell_distinguishes_atmosphere_and_wave(self):
        execute_cell(cell_source(3), "download.ipynb:snapshots", self.namespace)
        for filename in ("msl_f024.grib2", "sfc_f024.grib2", "pl_f024.grib2"):
            self.assertEqual(self.sidecar(self.output / filename)["model"], "gfs")
            self.assertEqual(
                self.sidecar(self.output / filename)["product"], "pgrb2.0p25"
            )
        wave = self.sidecar(self.output / "wave_f024.grib2")
        self.assertEqual((wave["model"], wave["product"]), ("gfs_wave", "global.0p25"))

    def test_actual_batch_cells_write_all_requested_hours_and_wave_product(self):
        for index in (4, 5, 6, 7):
            execute_cell(
                cell_source(index), f"download.ipynb:cell-{index}", self.namespace
            )
        for filename, step in (
            ("sfc_f000-f120_3h.grib2", 3),
            ("refc_f000-f120_3h.grib2", 3),
            ("pl_f000-f120_12h.grib2", 12),
            ("wave_f000-f120_3h.grib2", 3),
        ):
            forecasts = self.sidecar(self.output / filename)["requested_forecasts"]
            self.assertEqual(
                [entry["forecast_hour"] for entry in forecasts],
                list(range(0, 121, step)),
            )
            self.assertEqual(forecasts[-1]["valid_time"], "2026-02-05T18:00:00Z")
        wave = self.sidecar(self.output / "wave_f000-f120_3h.grib2")
        self.assertEqual((wave["model"], wave["product"]), ("gfs_wave", "global.0p25"))

    def test_failed_single_and_batch_downloads_publish_no_success_metadata(self):
        for helper, hours in (("download_step", 3), ("download_batch", [0, 3, 6])):
            with self.subTest(helper=helper):
                self.fail_hour = 3
                target = self.output / f"{helper}.grib2"
                with self.assertRaisesRegex(OSError, "download failed"):
                    self.namespace[helper](hours, ":TMP:", target)
                self.assertFalse(target.exists())
                self.assertFalse(metadata_helper.metadata_path(target).exists())

    def test_early_failed_rerun_preserves_existing_grib_and_sidecar(self):
        target = self.output / "sfc.grib2"
        self.namespace["download_step"](3, ":TMP:", target)
        previous = metadata_helper.metadata_path(target).read_bytes()
        self.fail_hour = 3
        with self.assertRaises(OSError):
            self.namespace["download_step"](3, ":TMP:", target)
        self.assertEqual(target.read_bytes(), b"forecast-3;")
        self.assertEqual(metadata_helper.metadata_path(target).read_bytes(), previous)

    def test_metadata_failure_after_replacement_removes_stale_sidecar_and_propagates(
        self,
    ):
        for helper, hours in (("download_step", 6), ("download_batch", [0, 6])):
            with self.subTest(helper=helper):
                target = self.output / f"{helper}.grib2"
                target.write_bytes(b"old-grib")
                metadata_helper.metadata_path(target).write_text('{"old": true}')
                with (
                    patch.object(
                        Path, "replace", side_effect=OSError("metadata disk error")
                    ),
                    self.assertRaises(metadata_helper.ForecastMetadataError),
                ):
                    self.namespace[helper](hours, ":TMP:", target)
                self.assertNotEqual(target.read_bytes(), b"old-grib")
                self.assertFalse(metadata_helper.metadata_path(target).exists())
                self.assertEqual(list(self.output.glob(".*.metadata.json.*.tmp")), [])

    def test_invalidation_failure_preserves_grib_and_reports_metadata_error(self):
        for helper, hours in (("download_step", 6), ("download_batch", [0, 6])):
            with self.subTest(helper=helper):
                target = self.output / f"{helper}.grib2"
                sidecar = metadata_helper.metadata_path(target)
                target.write_bytes(b"old-grib")
                sidecar.write_text('{"old": true}')
                original_unlink = Path.unlink

                def blocked_unlink(
                    path, *args, blocked=sidecar, unlink=original_unlink, **kwargs
                ):
                    if path == blocked:
                        raise PermissionError("sidecar is read-only")
                    return unlink(path, *args, **kwargs)

                with (
                    patch.object(Path, "unlink", blocked_unlink),
                    self.assertRaises(metadata_helper.ForecastMetadataError),
                ):
                    self.namespace[helper](hours, ":TMP:", target)
                self.assertEqual(target.read_bytes(), b"old-grib")
                self.assertEqual(json.loads(sidecar.read_text()), {"old": True})

    def test_optional_reflectivity_cell_propagates_metadata_failure(self):
        self.namespace["steps_3h"] = [0, 3]
        with (
            patch.object(Path, "replace", side_effect=OSError("metadata disk error")),
            self.assertRaises(metadata_helper.ForecastMetadataError),
        ):
            execute_cell(cell_source(5), "download.ipynb:reflectivity", self.namespace)
        self.assertFalse(
            metadata_helper.metadata_path(
                self.output / "refc_f000-f120_3h.grib2"
            ).exists()
        )


if __name__ == "__main__":
    unittest.main()
