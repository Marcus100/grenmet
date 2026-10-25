"""CAP PDF renderer tests (pure — no DB, no storage)."""

from datetime import UTC, datetime


def test_render_alert_pdf_returns_pdf_bytes() -> None:
    from src.cap.pdf import render_alert_pdf

    pdf = render_alert_pdf(
        identifier="GRD-2026-001",
        sent=datetime(2026, 6, 28, 12, 0, tzinfo=UTC),
        info_blocks=[
            {
                "headline": "Flash Flood Warning",
                "event": "Flash Flood",
                "severity": "Severe",
                "urgency": "Immediate",
                "certainty": "Likely",
                "description": "Heavy rainfall expected across St. George's.",
                "instruction": "Move to higher ground.",
            }
        ],
    )
    assert isinstance(pdf, bytes)
    assert pdf[:4] == b"%PDF"
    assert len(pdf) > 500


def test_render_alert_pdf_handles_unicode_and_empty_info() -> None:
    from src.cap.pdf import render_alert_pdf

    pdf = render_alert_pdf(
        identifier="GRD-2026-002",
        sent=datetime(2026, 6, 28, 12, 0, tzinfo=UTC),
        info_blocks=[{"headline": "Tempête — Grenâda", "description": "Café ☂"}],
    )
    assert pdf[:4] == b"%PDF"


def test_render_alert_pdf_escapes_markup(monkeypatch) -> None:
    import weasyprint

    from src.cap.pdf import render_alert_pdf

    captured: list[str] = []

    class CapturingHTML:
        def __init__(self, *, string: str, **_: object) -> None:
            captured.append(string)

        def write_pdf(self) -> bytes:
            return b"%PDF-captured"

    monkeypatch.setattr(weasyprint, "HTML", CapturingHTML)
    render_alert_pdf(
        identifier="GRD-<2026>",
        sent=datetime(2026, 6, 28, 12, 0, tzinfo=UTC),
        info_blocks=[
            {
                "headline": "<script>alert(1)</script>",
                "description": "Line one\nLine two & more",
                "instruction": "<b>Move</b>",
            }
        ],
    )

    html = captured[0]
    assert "&lt;script&gt;alert(1)&lt;/script&gt;" in html
    assert "<script>" not in html and "<b>Move</b>" not in html
    assert "GRD-&lt;2026&gt;" in html
    assert "Line one\nLine two &amp; more" in html
    assert "white-space: pre-wrap" in html


def test_cap_font_file_exists() -> None:
    from src.cap.pdf import _FONT

    assert _FONT.is_file()
