"""CAP PDF renderer tests (pure — no DB, no storage)."""

from datetime import datetime, timezone


def test_render_alert_pdf_returns_pdf_bytes() -> None:
    from src.cap.pdf import render_alert_pdf

    pdf = render_alert_pdf(
        identifier="GRD-2026-001",
        sent=datetime(2026, 6, 28, 12, 0, tzinfo=timezone.utc),
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
        sent=datetime(2026, 6, 28, 12, 0, tzinfo=timezone.utc),
        info_blocks=[{"headline": "Tempête — Grenâda", "description": "Café ☂"}],
    )
    assert pdf[:4] == b"%PDF"
