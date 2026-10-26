"""The METAR an observation implies and the comparison with a typed METAR.

Rounding rules are ICAO Annex 3 Appendix 3 as carried in WMO-No. 49 Vol. II. PAPER_ROW
is 12 UTC: 28.0 C, dew point 21.3 C, 15 kt from 070, visibility 18 km, 1 okta.
"""

import pytest

from src.eregister import metar, rules
from src.eregister.schemas import SynopDecoded, SynopWorkbook
from tests.test_eregister_validation import PAPER_ROW


def workbook(**changes: str) -> SynopWorkbook:
    return SynopWorkbook.model_validate({**PAPER_ROW, **changes})


def decoded(
    qnh_hpa: float | None = 1013.9, wb: SynopWorkbook | None = None
) -> SynopDecoded:
    """The decoded values: those of the workbook (dew point, humidity form), QNH set."""
    base = SynopDecoded() if wb is None else rules.validate_synop(wb)[1]
    return base.model_copy(
        update={"qnh_pa": None if qnh_hpa is None else qnh_hpa * 100}
    )


def codes(typed: str, qnh: float | None = 1013.9, **changes: str) -> set[str]:
    wb = workbook(metar_text=typed, **changes)
    return {issue.code for issue in metar.compare(wb, decoded(qnh, wb))}


def test_text_follows_the_observation() -> None:
    wb = workbook(s3_layer1_amount="1", s3_layer1_form="1", s3_layer1_height="13")
    # 13 = 390 to 420 m = 1279 to 1377 ft: the first 100 ft step is 1300 ft.
    assert metar.text(wb, decoded(wb=wb)) == (
        "METAR TGPY 301200Z 07015KT 9999 FEW013 28/21 Q1013="
    )


def test_a_matching_metar_has_no_warnings() -> None:
    wb = {"s3_layer1_amount": "1", "s3_layer1_form": "1", "s3_layer1_height": "13"}
    assert codes("METAR TGPY 301200Z 07015KT 9999 FEW013 28/21 Q1013=", **wb) == set()


@pytest.mark.parametrize(
    ("qnh", "typed", "warns"),
    [(1013.9, "Q1013", False), (1013.9, "Q1014", True), (1013.0, "Q1013", False)],
)
def test_qnh_is_rounded_down(qnh: float, typed: str, warns: bool) -> None:
    text = f"07015KT 9999 NSC 28/21 {typed}"
    assert ("metar_qnh" in codes(text, qnh, total_cloud="0")) is warns


@pytest.mark.parametrize(
    ("air", "typed", "warns"),
    [
        ("285", "29", False),  # 28.5 rounds up
        ("285", "28", True),
        ("284", "28", False),
        ("1005", "M00", False),  # -0.5 rounds up to M00
        ("1005", "00", False),
        ("1005", "M01", True),
    ],
)
def test_temperature_rounds_half_up(air: str, typed: str, warns: bool) -> None:
    text = f"07015KT 9999 NSC {typed}/M10 Q1013"
    issues = codes(text, total_cloud="0", air_temp=air, dew_point="1100")
    assert ("metar_temperature" in issues) is warns


def test_a_dew_point_that_differs_is_flagged() -> None:
    assert "metar_dew_point" in codes("07015KT 9999 NSC 28/19 Q1013", total_cloud="0")


@pytest.mark.parametrize(
    ("typed", "warns"),
    [
        ("07015KT", False),
        ("07015G26KT", True),  # no gust in the observation
        ("07018KT", True),
        ("08015KT", True),
        ("VRB15KT", True),
    ],
)
def test_wind(typed: str, warns: bool) -> None:
    text = f"{typed} 9999 NSC 28/21 Q1013"
    found = {"metar_wind", "metar_gust"} & codes(text, total_cloud="0")
    assert bool(found) is warns


def test_a_gust_is_reported_only_at_ten_knots_over_the_mean() -> None:
    # 15 kt with gusts 24 kt (9 over): not reported; 25 kt (10 over): reported.
    assert metar.expected(workbook(wind_gust="24"), decoded()).gust is None
    assert metar.expected(workbook(wind_gust="25"), decoded()).gust == 25
    assert "metar_gust" in codes(
        "07015KT 9999 NSC 28/21 Q1013", wind_gust="25", total_cloud="0"
    )


def test_metres_per_second_are_converted_to_knots() -> None:
    # 8 m/s = 15.55 kt -> 16 kt, one knot either way is accepted.
    wb = workbook(wind_indicator="1", wind_speed="08")
    assert metar.expected(wb, decoded()).wind == "07016KT"
    assert not {"metar_wind"} & codes(
        "07015KT 9999 NSC 28/21 Q1013",
        wind_indicator="1",
        wind_speed="08",
        total_cloud="0",
    )


def test_calm_is_less_than_one_knot() -> None:
    wb = workbook(wind_dir="00", wind_speed="00")
    assert metar.expected(wb, decoded()).wind == "00000KT"


@pytest.mark.parametrize(
    ("code", "lowest"),
    [(68, 9999), (90, 0), (93, 500), (95, 2000), (98, 9999)],
)
def test_visibility_codes_give_the_metar_scale(code: int, lowest: int) -> None:
    values = metar.visibility_values(code)
    assert values is not None
    assert values[0] == lowest


def test_a_visibility_range_accepts_every_value_inside_it() -> None:
    # VV 60 = 10 to 11 km is 9999; VV 05 = 500 to 600 m -> 500, 550.
    assert metar.visibility_values(5) == (500, 550)
    assert metar.visibility_values(55) is None
    assert "metar_visibility" in codes("07015KT 4000 NSC 28/21 Q1013", total_cloud="0")
    assert "metar_visibility" not in codes(
        "07015KT 0550 NSC 28/21 Q1013",
        total_cloud="0",
        visibility="05",
        present_wx="10",
    )


def test_cavok_needs_no_cloud_and_good_visibility() -> None:
    assert "metar_cavok" not in codes("07015KT CAVOK 28/21 Q1013", total_cloud="0")
    assert "metar_cavok" in codes(
        "07015KT CAVOK 28/21 Q1013", visibility="60", total_cloud="0", present_wx="00"
    ) | codes(
        "07015KT CAVOK 28/21 Q1013",
        s3_layer1_amount="3",
        s3_layer1_form="1",
        s3_layer1_height="05",
    )


def test_cloud_layers_are_matched_one_to_one() -> None:
    layers = {"s3_layer1_amount": "3", "s3_layer1_form": "1", "s3_layer1_height": "10"}
    base = "07015KT 9999 {} 28/21 Q1013"
    assert not {"metar_cloud_missing", "metar_cloud_extra"} & codes(
        base.format("SCT010"), **layers
    )
    assert "metar_cloud_missing" in codes(base.format("BKN010"), **layers)
    assert "metar_cloud_extra" in codes(base.format("SCT010 BKN020"), **layers)
    assert "metar_cloud_missing" in codes(base.format("NSC"), **layers)


def test_clear_sky_means_no_cloud_groups() -> None:
    assert "metar_cloud_extra" in codes(
        "07015KT 9999 FEW040 28/21 Q1013", total_cloud="0"
    )
    assert not {"metar_cloud_extra"} & codes(
        "07015KT 9999 NSC 28/21 Q1013", total_cloud="0"
    )


def test_high_cloud_without_cumulonimbus_is_not_reported() -> None:
    wb = workbook(s3_layer1_amount="4", s3_layer1_form="1", s3_layer1_height="57")
    layers = metar.expected(wb, decoded()).layers
    assert [layer.optional for layer in layers] == [True]
    assert "SCT" not in (metar.text(wb, decoded(wb=wb)) or "")


def test_cumulonimbus_is_reported_at_any_height() -> None:
    wb = workbook(s3_layer1_amount="4", s3_layer1_form="9", s3_layer1_height="57")
    assert [layer.cumulonimbus for layer in metar.expected(wb, decoded()).layers] == [
        True
    ]


def test_obscured_sky_needs_vertical_visibility() -> None:
    obscured = {
        "total_cloud": "9",
        "s3_layer1_amount": "9",
        "s3_layer1_form": "/",
        "s3_layer1_height": "02",
    }
    assert "metar_cloud_missing" in codes("07015KT 9999 NSC 28/21 Q1013", **obscured)
    assert "metar_cloud_missing" not in codes(
        "07015KT 9999 VV002 28/21 Q1013", **obscured
    )


def test_a_blank_metar_is_not_compared() -> None:
    assert metar.compare(workbook(), decoded()) == []
    assert metar.compare(workbook(metar_text="   "), decoded()) == []


def test_issues_are_warnings_on_the_metar_field() -> None:
    issues, _ = rules.validate_synop(
        workbook(metar_text="07099KT 9999 NSC 28/21 Q1013", total_cloud="0")
    )
    found = [i for i in issues if i.code == "metar_wind"]
    assert found
    assert {i.severity for i in found} == {"warning"}
    assert {i.field for i in found} == {"metar_text"}
    assert not [i for i in issues if i.severity == "error"]


def test_a_nil_report_is_not_compared() -> None:
    nil = SynopWorkbook.model_validate(
        {k: v for k, v in PAPER_ROW.items() if k in rules.IDENTIFICATION}
        | {"metar_text": "garbage"}
    )
    issues, decoded_nil = rules.validate_synop(nil)
    assert decoded_nil.is_nil_report
    assert not [i for i in issues if i.field == "metar_text"]


# --- review fixes -------------------------------------------------------------------


def test_dew_point_comes_from_the_decoded_value_not_the_humidity_group() -> None:
    # 2 9UUU: relative humidity 75 % at 28.0 C is a dew point of about 23 C (Magnus),
    # never the 7.5 C the digits 075 would read as.
    wb = workbook(dew_point="9075", metar_text="07015KT 9999 NSC 28/23 Q1013")
    dec = decoded(wb=wb)
    assert dec.dew_point_k is not None
    magnus = f"{round(dec.dew_point_k - 273.15):02d}"
    assert magnus == "23"
    assert f" 28/{magnus} " in (metar.text(wb, dec) or "")
    assert "metar_dew_point" not in codes(
        "07015KT 9999 NSC 28/23 Q1013", total_cloud="0", dew_point="9075"
    )
    assert "metar_dew_point" in codes(
        "07015KT 9999 NSC 28/08 Q1013", total_cloud="0", dew_point="9075"
    )


def test_cloud_amount_without_layers_is_not_called_clear_or_compared() -> None:
    # The paper row keys N=1 and no layer group.
    wb = workbook()
    text = metar.text(wb, decoded(wb=wb))
    assert text is not None
    assert "FEW///" in text
    assert "NSC" not in text
    for typed in ("FEW018", "SCT030 BKN050", "NSC"):
        assert not {"metar_cloud_extra", "metar_cloud_missing"} & codes(
            f"07015KT 9999 {typed} 28/21 Q1013"
        )


def test_a_high_non_cumulonimbus_layer_may_be_typed() -> None:
    layers = {"s3_layer1_amount": "4", "s3_layer1_form": "1", "s3_layer1_height": "57"}
    # 57 = 2100 to 2400 m = 6890 to 7874 ft.
    assert not {"metar_cloud_extra", "metar_cloud_missing"} & codes(
        "07015KT 9999 SCT070 28/21 Q1013", **layers
    )
    assert not {"metar_cloud_extra", "metar_cloud_missing"} & codes(
        "07015KT 9999 NSC 28/21 Q1013", **layers
    )
    assert "metar_cloud_extra" in codes("07015KT 9999 BKN070 28/21 Q1013", **layers)


def test_trend_and_remark_cloud_is_not_main_body_cloud() -> None:
    clear = "07015KT 9999 NSC 28/21 Q1013"
    for tail in ("TEMPO 4000 SHRA BKN010", "BECMG FEW020", "RMK CB OVR BKN040"):
        assert "metar_cloud_extra" not in codes(f"{clear} {tail}", total_cloud="0")


@pytest.mark.parametrize("code", [61, 62, 70, 80, 81, 88, 89])
def test_cumulonimbus_above_3000_m_has_a_plausible_base(code: int) -> None:
    wb = workbook(s3_layer1_amount="4", s3_layer1_form="9", s3_layer1_height=str(code))
    layer = metar.expected(wb, decoded()).layers[0]
    assert layer.shown is not None
    assert layer.shown >= 100  # above 10 000 ft; never 000
    assert layer.shown % 10 == 0  # 1000 ft steps
    assert layer.shown in layer.allowed
    text = metar.text(wb, decoded(wb=wb)) or ""
    assert "SCT000CB" not in text
    assert f"SCT{layer.shown:03d}CB" in text


def test_an_unused_height_code_on_a_cumulonimbus_shows_slashes() -> None:
    wb = workbook(s3_layer1_amount="4", s3_layer1_form="9", s3_layer1_height="52")
    assert "SCT///CB" in (metar.text(wb, decoded(wb=wb)) or "")


def test_a_variable_wind_keeps_its_gust_in_text_and_comparison() -> None:
    wind = {"wind_dir": "99", "wind_gust": "26", "total_cloud": "0"}
    assert metar.expected(workbook(**wind), decoded()).wind == "VRB15G26KT"
    assert "metar_gust" not in codes("VRB15G26KT 9999 NSC 28/21 Q1013", **wind)
    assert "metar_gust" in codes("VRB15KT 9999 NSC 28/21 Q1013", **wind)


def test_a_negative_temperature_that_rounds_to_zero_is_written_m00() -> None:
    temps = {"air_temp": "1003", "dew_point": "1010", "total_cloud": "0"}
    wb = workbook(**temps)
    assert " M00/M01 " in (metar.text(wb, decoded(wb=wb)) or "")
    for typed in ("M00", "00"):
        assert "metar_temperature" not in codes(
            f"07015KT 9999 NSC {typed}/M01 Q1013", **temps
        )


def test_an_obscured_sky_with_an_unusable_height_gives_vv_slashes() -> None:
    obscured = {
        "total_cloud": "9",
        "s3_layer1_amount": "9",
        "s3_layer1_form": "/",
        "s3_layer1_height": "52",
    }
    wb = workbook(**obscured)
    assert " VV/// " in (metar.text(wb, decoded(wb=wb)) or "")
    assert "metar_cloud_missing" not in codes(
        "07015KT 9999 VV/// 28/21 Q1013", **obscured
    )
