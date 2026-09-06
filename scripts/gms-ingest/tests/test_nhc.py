"""Bulletin parsing acceptance tests."""

import json
import unittest

from gms_ingest import text as nhc


def outlook(body, special=False):
    title = (
        "Special Tropical Weather Outlook"
        if special
        else "Atlantic Tropical Weather Outlook"
    )
    text = (
        "TWOAT\nFor the North Atlantic...Caribbean Sea and the Gulf of America:\n\n"
        + body
        + "\n\n$$\nForecaster Test"
    )
    return (
        f"<rss><channel><item><title>{title}</title>"
        "<pubDate>Sat, 05 Sep 2026 05:11:46 GMT</pubDate><guid>bulletin-1</guid>"
        "<link>https://www.nhc.noaa.gov/</link><description><![CDATA["
        + text.replace("\n", "<br />")
        + "]]></description></item></channel></rss>"
    ).encode()


EMPTY = outlook("Tropical cyclone formation is not expected during the next 7 days.")
BLOCK = (
    "Eastern Atlantic:\nA tropical wave may develop.\n"
    "* Formation chance through 48 hours...low...near 0 percent.\n"
    "* Formation chance through 7 days...medium...40 percent."
)


class ParserTests(unittest.TestCase):
    def test_storm_filter_and_optional_products(self):
        storm = {"id": "al012026", "publicAdvisory": None, "extra": "retained"}
        self.assertEqual(
            nhc.parse_storms(json.dumps({"activeStorms": [storm, {"id": "ep012026"}]})),
            [storm],
        )
        self.assertEqual(nhc.parse_storms(b'{"activeStorms": []}'), [])

    def test_invalid_storms(self):
        for raw in (
            b"broken",
            b"{}",
            b'{"activeStorms": [{}]}',
            b'{"activeStorms": [{"id": "bad"}]}',
        ):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                nhc.parse_storms(raw)

    def test_empty_outlook(self):
        self.assertEqual(nhc.parse_outlook(EMPTY)["disturbances"], [])

    def test_active_cyclone_intro_with_no_new_development(self):
        raw = outlook(
            "NHC is issuing advisories on Hurricane Example.\n\n"
            "Tropical cyclone formation is not expected during the next 7 days."
        )
        self.assertEqual(nhc.parse_outlook(raw)["disturbances"], [])

    def test_wrapped_disturbance_heading(self):
        raw = outlook(
            BLOCK.replace(
                "Eastern Atlantic:", "Eastern and Central\nTropical Atlantic:"
            )
        )
        self.assertEqual(
            nhc.parse_outlook(raw)["disturbances"][0]["heading"],
            "Eastern and Central Tropical Atlantic:",
        )

    def test_special_multiple_disturbances_and_qualifiers(self):
        result = nhc.parse_outlook(
            outlook(BLOCK + "\n\n" + BLOCK.replace("Eastern", "Western"), True)
        )
        self.assertEqual(len(result["disturbances"]), 2)
        first = result["disturbances"][0]
        self.assertEqual(first["heading"], "Eastern Atlantic:")
        self.assertIsNone(first["probabilities"]["48 hours"]["percent"])
        self.assertIn("near 0", first["probabilities"]["48 hours"]["statement"])
        self.assertEqual(first["probabilities"]["7 days"]["percent"], 40)
        self.assertEqual(result["source_id"], "bulletin-1")

    def test_unrecognized_outlook_never_becomes_empty(self):
        for raw in (
            outlook("Unfamiliar bulletin."),
            outlook(BLOCK.replace("40 percent", "140 percent")),
            outlook(BLOCK.replace("7 days", "5 days")),
            b"<rss/>",
        ):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                nhc.parse_outlook(raw)
        with self.assertRaises(nhc.ET.ParseError):
            nhc.parse_outlook(b"<broken")


if __name__ == "__main__":
    unittest.main()
