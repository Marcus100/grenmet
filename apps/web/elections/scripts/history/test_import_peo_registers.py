"""Synthetic parser checks; no elector data or network requests."""

import unittest
from unittest.mock import patch

from import_peo_registers import extract


def page(rows, reference="16/10/2026"):
    header = f"POLLING DIVISION: A01\nREFERENCE DATE: {reference}\n"
    columns = f"{'SEQ':<6}{'NAME':<25}{'SEX':<6}{'ADDRESS':<25}REGISTRATION"
    return header + columns + "\n" + "\n".join(
        f"{seq:<6}{name:<25}{sex:<6}{'Example address':<25}{identifier}"
        for seq, name, sex, identifier in rows
    ) + "\f"


class ExtractTest(unittest.TestCase):
    def parse(self, text):
        with patch("import_peo_registers.subprocess.check_output", return_value=text):
            return extract("fixture.pdf", "16/10/2026")

    def test_reads_sex_column_not_name_and_keeps_u(self):
        counts, identifiers, pages = self.parse(page([
            (1, "F M Example", "U", "100001"),
            (2, "U Example", "F", "100002"),
            (3, "F Example", "M", "100003"),
        ]))
        self.assertEqual(counts["A01"], {"U": 1, "F": 1, "M": 1})
        self.assertEqual(len(identifiers), 3)
        self.assertEqual(pages, 1)

    def test_rejects_missing_sequence_and_duplicate_identifier(self):
        for rows in [
            [(2, "Example", "M", "100001")],
            [(1, "Example", "M", "100001"), (2, "Example", "F", "100001")],
        ]:
            with self.subTest(rows=rows), self.assertRaises(ValueError):
                self.parse(page(rows))

    def test_rejects_unknown_sex_and_wrong_reference_date(self):
        for text in [
            page([(1, "Example", "X", "100001")]),
            page([(1, "Example", "M", "100001")], "01/10/2026"),
        ]:
            with self.subTest(text=text), self.assertRaises(ValueError):
                self.parse(text)


if __name__ == "__main__":
    unittest.main()
