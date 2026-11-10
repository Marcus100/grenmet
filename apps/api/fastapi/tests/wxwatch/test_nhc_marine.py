"""Parse one Offshore Waters zone block (AMZ058) from real NHC OFFNT3 text."""

from pathlib import Path

from src.wxwatch import nhc_marine

FIXTURE = Path(__file__).with_name("fixtures") / "offnt3-2026-11-09-amz058.txt"


def fixture_text() -> str:
    return FIXTURE.read_text()


def test_real_offnt3_zone_block_becomes_structured_periods():
    block = nhc_marine.zone_block(fixture_text(), "AMZ058")
    assert block is not None
    assert (
        nhc_marine.zone_name(block)
        == "Offshore Waters Windward Islands including Trinidad and Tobago"
    )
    periods = nhc_marine.parse_periods(block)
    assert [period.label for period in periods] == [
        "TONIGHT",
        "TUE",
        "TUE NIGHT",
        "WED",
        "WED NIGHT",
        "THU",
        "THU NIGHT",
        "FRI",
        "FRI NIGHT",
        "SAT",
        "SAT NIGHT",
    ]
    tonight = periods[0]
    assert tonight.wind_direction_from == "E"
    assert tonight.wind_direction_to is None
    assert (tonight.wind_min_kt, tonight.wind_max_kt) == (15, 20)
    assert tonight.gust_kt is None
    assert (tonight.sea_min_ft, tonight.sea_max_ft) == (3, 5)
    assert tonight.weather == []
    assert tonight.text.startswith("E winds 15 to 20 kt in the Caribbean")
    # Wrapped lines are joined, and the text after the "$$" terminator is never read.
    tue_night = periods[2]
    assert (tue_night.sea_min_ft, tue_night.sea_max_ft) == (4, 6)
    assert tue_night.weather == ["scattered showers", "isolated tstms"]
    assert "AMZ059" not in tue_night.text
    tue = periods[1]
    assert tue.wind_direction_from == "E"
    assert tue.wind_direction_to == "SE"
    assert (tue.wind_min_kt, tue.wind_max_kt) == (15, 20)


def test_other_zone_is_not_returned_for_amz058():
    text = fixture_text()
    assert nhc_marine.zone_block(text, "AMZ999") is None
    other = nhc_marine.zone_block(text, "AMZ057")
    assert other is not None
    assert "Venezuela Basin" in (nhc_marine.zone_name(other) or "")


def test_gusts_ranges_and_single_speeds():
    block = (
        "Offshore Waters Test-\n"
        "252 PM EST Mon Nov 9 2026\n\n"
        ".TODAY...NE winds 15 to 20 kt with gusts up to 25 kt. Seas 6 to 8 ft.\n"
        ".TONIGHT...NE winds 10 kt. Seas 2 to 4 feet.\n"
    )
    today, tonight = nhc_marine.parse_periods(block)
    assert (today.wind_min_kt, today.wind_max_kt, today.gust_kt) == (15, 20, 25)
    assert (today.sea_min_ft, today.sea_max_ft) == (6, 8)
    assert (tonight.wind_min_kt, tonight.wind_max_kt) == (10, 10)
    assert (tonight.sea_min_ft, tonight.sea_max_ft) == (2, 4)


def test_variable_winds_and_seas_of_or_less():
    block = (
        "Offshore Waters Test-\n\n"
        ".TODAY...Variable winds less than 5 kt, becoming N 10 kt late. "
        "Seas 3 ft or less.\n"
        ".TUE...Winds variable less than 5 kt. Seas 2 ft or less.\n"
    )
    today, tuesday = nhc_marine.parse_periods(block)
    assert today.wind_direction_from == "Variable"
    assert (today.wind_min_kt, today.wind_max_kt) == (0, 5)
    assert (today.sea_min_ft, today.sea_max_ft) == (0, 3)
    assert tuesday.wind_direction_from == "Variable"
    assert (tuesday.wind_min_kt, tuesday.wind_max_kt) == (0, 5)


def test_wrapped_wind_and_sea_statements_are_joined():
    block = (
        "Offshore Waters Test-\n\n"
        ".TODAY...NE to E winds 10\nto 15 kt. Seas 3\nto 5 ft. Scattered\n"
        "showers and isolated tstms.\n"
    )
    (today,) = nhc_marine.parse_periods(block)
    assert today.wind_direction_from == "NE"
    assert today.wind_direction_to == "E"
    assert (today.wind_min_kt, today.wind_max_kt) == (10, 15)
    assert (today.sea_min_ft, today.sea_max_ft) == (3, 5)
    assert today.weather == ["scattered showers", "isolated tstms"]


def test_grouped_zone_header_covers_every_listed_zone():
    text = (
        "AMZ056-058-100800-\n"
        "Offshore Waters Test-\n\n"
        ".TODAY...E winds 15 kt. Seas 4 ft.\n\n$$\n\n"
        "AMZ060-100800-\nSW Caribbean-\n\n.TODAY...N winds 10 kt. Seas 3 ft.\n\n$$\n"
    )
    block = nhc_marine.zone_block(text, "AMZ058")
    assert block is not None
    (today,) = nhc_marine.parse_periods(block)
    assert today.wind_direction_from == "E"
    assert nhc_marine.zone_block(text, "AMZ060") is not None


def test_missing_wording_leaves_fields_empty_instead_of_guessing():
    block = "Offshore Waters Test-\n\n.TODAY...Showers likely. Visibility reduced.\n"
    (today,) = nhc_marine.parse_periods(block)
    assert today.wind_direction_from is None
    assert today.wind_min_kt is None and today.wind_max_kt is None
    assert today.sea_min_ft is None and today.sea_max_ft is None
    assert today.weather == ["showers"]
