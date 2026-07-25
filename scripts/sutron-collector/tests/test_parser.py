from decimal import Decimal
from pathlib import Path

from sutron_collector.parser import parse_response

FIXTURE = Path(__file__).parent / "fixtures" / "show_tag_c.txt"


def test_parse_real_show_tag_capture() -> None:
    observations = parse_response(FIXTURE.read_bytes())

    assert len(observations) == 79
    assert observations[0].tag == "QNH"
    assert observations[0].value == Decimal("1011.8")
    assert observations[0].status_tokens == ("G", "OK")
    assert observations[0].raw_line == "QNH                   1011.8   G OK"


def test_parser_preserves_unknown_tags_and_bad_quality() -> None:
    observations = parse_response(FIXTURE.read_text())
    md = next(observation for observation in observations if observation.tag == "MD")

    assert md.value == Decimal("0")
    assert md.status_tokens == ("B", "OK")


def test_parser_ignores_prompts_noise_and_binary_grep_notice() -> None:
    response = (
        b"Sutron 9210 prompt\r\n"
        b"show /tag /c\r\n"
        b"AT       26.1   G OK\r\n"
        b"Binary file /home/data/log/Sutron.log matches\r\n"
        b">\r\n"
    )

    observations = parse_response(response)

    assert [(item.tag, item.value) for item in observations] == [
        ("AT", Decimal("26.1"))
    ]
    assert observations[0].status_tokens == ("G", "OK")


def test_parser_keeps_all_status_tokens() -> None:
    [observation] = parse_response("RAIN 0.0 G OK EXTRA\r\n")

    assert observation.status_tokens == ("G", "OK", "EXTRA")
