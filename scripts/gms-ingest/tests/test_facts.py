import unittest

from test_nhc import BLOCK, EMPTY, outlook

from gms_ingest import facts, text


class FactTests(unittest.TestCase):
    def test_no_storm_is_an_explicit_empty_outlook(self):
        self.assertEqual(facts.extract(text.parse_outlook(EMPTY))["systems"], [])

    def test_multiple_disturbances_own_their_probabilities(self):
        decoded = text.parse_outlook(
            outlook(
                BLOCK
                + "\n\n"
                + BLOCK.replace("Eastern", "Western").replace(
                    "40 percent", "70 percent"
                )
            )
        )
        systems = facts.extract(decoded)["systems"]
        self.assertEqual([system["facts"][1]["value"] for system in systems], [40, 70])
        self.assertIsNone(systems[0]["facts"][0]["value"])
        self.assertIn("near 0", systems[0]["facts"][0]["source_text"])

    def test_embedded_pressure_belongs_to_low_only(self):
        decoded = {
            "sections": [
                {
                    "heading": "TROPICAL WAVES",
                    "text": "An Atlantic tropical wave is along 54W south of 18N, moving west at 10 to 15 kt. A 1010 mb low is near 12N 54W.\n\nA tropical wave is along 70W, moving west at 15 kt.",
                }
            ]
        }
        systems = facts.extract(decoded)["systems"]
        self.assertEqual(
            [system["feature_type"] for system in systems],
            ["tropical_wave", "low_pressure_centre", "tropical_wave"],
        )
        self.assertFalse(
            any(
                fact["key"] == "pressure"
                for fact in systems[0]["facts"] + systems[2]["facts"]
            )
        )
        self.assertEqual(systems[1]["facts"][0]["value"], 1010)
        self.assertEqual(
            systems[1]["parent_feature_key"], systems[0]["source_feature_key"]
        )

    def test_marine_ranges_remain_in_their_zone_and_period(self):
        decoded = {
            "zones": [
                {
                    "zone_id": "AMZ063",
                    "text": ".TODAY...NE winds 15 to 20 kt. Seas 5 to 7 ft.\n.TONIGHT...E winds 10 kt. Seas 3 ft.",
                }
            ]
        }
        periods = facts.extract(decoded)["marine_periods"]
        self.assertEqual([period["label"] for period in periods], ["TODAY", "TONIGHT"])
        self.assertEqual(periods[0]["facts"][2]["maximum"], 7)
        self.assertEqual(periods[1]["facts"][2]["minimum"], 3)
        self.assertEqual(periods[0]["facts"][2]["unit"], "ft")

    def test_update_and_aviation_discovery(self):
        from gms_ingest.discovery import advisory_products

        products = advisory_products(
            [
                {
                    "text": "TCUAT1 AL012026",
                    "url": "https://www.nhc.noaa.gov/text/TCUAT1.shtml",
                },
                {
                    "text": "TCANT1 AL012026",
                    "url": "https://www.nhc.noaa.gov/text/TCANT1.shtml",
                },
            ]
        )
        self.assertEqual([product.code for product in products], ["TCUAT1", "TCANT1"])
        self.assertEqual(
            facts.family({"code": "TCANT1", "storm_id": "al012026"}), "aviation_recon"
        )

    def test_analysis_times_are_distinct_and_unknown_without_issuance(self):
        body = (
            "Based on 1800 UTC surface analysis and satellite imagery through 2350 UTC."
        )
        times = text.analysis_times(body, "2026-09-18T00:05:00Z")
        self.assertEqual(times["reference_time"], "2026-09-17T18:00:00+00:00")
        self.assertEqual(times["observed_at"], "2026-09-17T23:50:00+00:00")
        self.assertEqual(text.analysis_times(body, None), {})


def test_advertised_wallet_products_are_discovered_only_for_active_metadata():
    from gms_ingest.discovery import storm_products

    products = storm_products([{"id": "al012026", "binNumber": "AT1"}], {"storms"})
    assert {product.code for product in products} == {"TCUAT1", "TCANT1"}
    assert all(
        product.optional and product.storm_id == "al012026" for product in products
    )
    assert storm_products([], {"storms"}) == []
