"""Render a CAP alert to a simple PDF (pure-python via fpdf2).

fpdf2 is chosen over weasyprint to avoid system library dependencies (pango/cairo)
in the container image. fpdf is imported lazily so the module is importable even if
the optional dependency is absent.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any


def _latin1(text: str) -> str:
    """Core PDF fonts are latin-1 only; replace unmappable characters."""
    return text.encode("latin-1", "replace").decode("latin-1")


def render_alert_pdf(
    *, identifier: str, sent: datetime, info_blocks: list[dict[str, Any]]
) -> bytes:
    """Render an alert summary PDF. ``info_blocks`` items use keys:
    headline, event, severity, urgency, certainty, description, instruction."""
    from fpdf import FPDF  # lazy import (optional dependency)

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=15)
    pdf.add_page()

    pdf.set_font("Helvetica", style="B", size=18)
    pdf.cell(0, 10, _latin1("CAP Alert"), new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Helvetica", size=10)
    pdf.cell(0, 6, _latin1(f"Identifier: {identifier}"), new_x="LMARGIN", new_y="NEXT")
    pdf.cell(
        0,
        6,
        _latin1(f"Sent: {sent.isoformat()}"),
        new_x="LMARGIN",
        new_y="NEXT",
    )
    pdf.ln(4)

    for block in info_blocks:
        pdf.set_font("Helvetica", style="B", size=13)
        headline = block.get("headline") or block.get("event") or "Alert"
        pdf.multi_cell(
            0, 7, _latin1(str(headline)), new_x="LMARGIN", new_y="NEXT"
        )
        pdf.set_font("Helvetica", size=9)
        meta = " | ".join(
            f"{label}: {block[key]}"
            for label, key in (
                ("Severity", "severity"),
                ("Urgency", "urgency"),
                ("Certainty", "certainty"),
            )
            if block.get(key)
        )
        if meta:
            pdf.multi_cell(0, 6, _latin1(meta), new_x="LMARGIN", new_y="NEXT")
        if block.get("description"):
            pdf.set_font("Helvetica", size=10)
            pdf.multi_cell(
                0,
                6,
                _latin1(str(block["description"])),
                new_x="LMARGIN",
                new_y="NEXT",
            )
        if block.get("instruction"):
            pdf.set_font("Helvetica", style="I", size=10)
            pdf.multi_cell(
                0,
                6,
                _latin1(f"Instruction: {block['instruction']}"),
                new_x="LMARGIN",
                new_y="NEXT",
            )
        pdf.ln(3)

    return bytes(pdf.output())
