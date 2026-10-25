"""Render a CAP alert to a simple PDF with WeasyPrint.

Every PDF in the API goes through WeasyPrint (see ``src/hr/signatures`` for the
shared font). WeasyPrint is imported lazily so importing this module stays cheap.
"""

from __future__ import annotations

from datetime import datetime
from html import escape
from pathlib import Path
from typing import Any

_FONT = (
    Path(__file__).parents[1] / "hr" / "signatures" / "fonts" / "NotoSans-Regular.ttf"
)

_STYLE = f"""
@font-face {{ font-family: Document; src: url('{_FONT.as_uri()}'); }}
@page {{ size: A4; margin: 16mm; }}
body {{ font-family: Document, sans-serif; font-size: 10pt; line-height: 1.4; color: #111827; }}
h1 {{ font-size: 18pt; margin: 0 0 3mm; }}
h2 {{ font-size: 13pt; margin: 6mm 0 1mm; }}
p {{ margin: 0 0 1.5mm; overflow-wrap: anywhere; white-space: pre-wrap; }}
.meta {{ font-size: 9pt; color: #4b5563; }}
.instruction {{ font-style: italic; }}
"""


def render_alert_pdf(
    *, identifier: str, sent: datetime, info_blocks: list[dict[str, Any]]
) -> bytes:
    """Render an alert summary PDF. ``info_blocks`` items use keys:
    headline, event, severity, urgency, certainty, description, instruction."""
    from weasyprint import HTML

    sections: list[str] = []
    for block in info_blocks:
        headline = block.get("headline") or block.get("event") or "Alert"
        parts = [f"<h2>{escape(str(headline))}</h2>"]
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
            parts.append(f'<p class="meta">{escape(meta)}</p>')
        if block.get("description"):
            parts.append(f"<p>{escape(str(block['description']))}</p>")
        if block.get("instruction"):
            parts.append(
                f'<p class="instruction">Instruction: {escape(str(block["instruction"]))}</p>'
            )
        sections.append("".join(parts))

    html = (
        '<!doctype html><html><head><meta charset="utf-8">'
        f"<style>{_STYLE}</style></head><body>"
        "<h1>CAP Alert</h1>"
        f'<p class="meta">Identifier: {escape(identifier)}</p>'
        f'<p class="meta">Sent: {escape(sent.isoformat())}</p>'
        f"{''.join(sections)}</body></html>"
    )
    pdf = HTML(string=html).write_pdf()
    if not isinstance(pdf, bytes):
        raise TypeError("WeasyPrint returned no PDF bytes")
    return pdf
