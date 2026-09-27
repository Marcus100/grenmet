"""Check native shutdown too: in-process assertions miss allocator crashes."""

import subprocess
import sys
import unittest


class NativeRuntimeTests(unittest.TestCase):
    def test_grid_then_map_imports_exit_cleanly(self):
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                "from gms_ingest import grids, maps; "
                "import eccodes; from pyproj import CRS; "
                "assert CRS.from_epsg(4326).is_geographic; "
                "assert eccodes.codes_get_api_version()",
            ],
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stderr)
