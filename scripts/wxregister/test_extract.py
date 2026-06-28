"""Unit tests for the pure helpers in extract.py.

The Claude API call (extract_rows) is integration-only and not exercised here;
these cover schema construction, CSV writing, and input resolution so the data
shape stays stable as the column set evolves. Run with:  python -m unittest
"""

from __future__ import annotations

import csv
import tempfile
import unittest
from pathlib import Path

import extract


class BuildSchemaTest(unittest.TestCase):
    def test_schema_shape(self) -> None:
        schema = extract.build_schema()
        self.assertEqual(schema["type"], "object")
        self.assertFalse(schema["additionalProperties"])
        items = schema["properties"]["rows"]["items"]
        self.assertFalse(items["additionalProperties"])
        # Every model field is required and a plain string (no union types:
        # structured outputs caps a schema at 16 union-typed parameters).
        for field in extract._MODEL_FIELDS:
            self.assertIn(field, items["properties"])
            self.assertEqual(items["properties"][field]["type"], "string")
        self.assertEqual(set(items["required"]), set(extract._MODEL_FIELDS))
        # No field may use a union/nullable type, or we'd hit the 16-param cap.
        union_typed = [
            f for f, s in items["properties"].items()
            if isinstance(s.get("type"), list) or "anyOf" in s
        ]
        self.assertEqual(union_typed, [])

    def test_provenance_fields_excluded_from_model_output(self) -> None:
        self.assertNotIn("source_image", extract._MODEL_FIELDS)
        self.assertNotIn("row_index", extract._MODEL_FIELDS)


class BuildPromptTest(unittest.TestCase):
    def test_prompt_mentions_every_model_field(self) -> None:
        prompt = extract.build_prompt()
        for field in extract._MODEL_FIELDS:
            self.assertIn(field, prompt)


class WriteCsvTest(unittest.TestCase):
    def test_header_and_null_handling(self) -> None:
        rows = [
            {"source_image": "a.png", "row_index": "1", "air_temp": "27.4", "dew_point": None},
            {"source_image": "a.png", "row_index": "2", "air_temp": "-1.0"},  # missing keys
        ]
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "out.csv"
            extract.write_csv(rows, out)
            with out.open(newline="", encoding="utf-8") as fh:
                self.assertEqual(next(csv.reader(fh)), [c for c, _, _ in extract.COLUMNS])
            with out.open(newline="", encoding="utf-8") as fh:
                read = list(csv.DictReader(fh))

        self.assertEqual(read[0]["air_temp"], "27.4")
        self.assertEqual(read[0]["dew_point"], "")        # None -> empty
        self.assertEqual(read[1]["dew_point"], "")        # missing -> empty
        self.assertEqual(read[1]["air_temp"], "-1.0")


class ResolveInputsTest(unittest.TestCase):
    def test_explicit_images_win_over_glob(self) -> None:
        import argparse

        ns = argparse.Namespace(images=["x.png", "y.png"], glob="*.png")
        self.assertEqual(extract.resolve_inputs(ns), [Path("x.png"), Path("y.png")])


if __name__ == "__main__":
    unittest.main()
