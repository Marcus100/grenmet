"""Render saved weather revisions without browser state or remote resources."""

import re
from pathlib import Path

from fpdf import FPDF
from fpdf.enums import WrapMode

from .schemas import ProductPdfSource
from .validation import FIELDS, ISSUE_HOURS


def publication_label(source: ProductPdfSource) -> str:
    if source.action == "draft":
        return "DRAFT — NOT FOR ISSUE"
    if source.action == "withdraw":
        return "WITHDRAWAL RECORD — NOT FOR ISSUE"
    if not source.current_publication:
        return "PUBLISHED ISSUE — ARCHIVE COPY"
    return "PUBLISHED ISSUE"


def document_fields(source: ProductPdfSource) -> list[tuple[str, str]]:
    fields = []
    for field in FIELDS[source.kind]:
        hidden = (
            field.section.endswith(" impacts")
            or field.section == "Risk assessment"
            or field.key in {"weatherAlert", "windAlert", "marineAlert"}
            or re.fullmatch(r"day[1-4](Alerts|Impact|Response)", field.key)
        )
        if source.kind in ISSUE_HOURS and hidden:
            continue
        fields.append(
            (
                f"{field.section} · {field.label}",
                source.values.get(field.key, "") or "—",
            )
        )
    return fields


def render_product_pdf(source: ProductPdfSource) -> bytes:
    class RevisionPDF(FPDF):
        def footer(self) -> None:
            self.set_y(-14)
            self.set_font("Noto", size=8)
            self.cell(
                0,
                6,
                f"{publication_label(source)} · r{source.revision} · Page {self.page_no()}",
                align="C",
            )

    pdf = RevisionPDF(format="A4")
    pdf.set_auto_page_break(auto=True, margin=18)
    font = Path(__file__).with_name("fonts") / "NotoSans-Regular.ttf"
    pdf.add_font("Noto", fname=str(font))
    pdf.set_title(f"GMS {source.kind} r{source.revision}")
    pdf.set_author("Grenada Meteorological Service")
    pdf.add_page()

    def line(value: str, size: int = 10) -> None:
        pdf.set_font("Noto", size=size)
        pdf.multi_cell(
            0, 6, value, new_x="LMARGIN", new_y="NEXT", wrapmode=WrapMode.CHAR
        )

    line("GRENADA METEOROLOGICAL SERVICE", 15)
    line(f"{source.kind.title()} · Revision {source.revision}", 13)
    line(publication_label(source), 12)
    line(f"Product ID: {source.product_id}", 8)
    line(f"Revision recorded (UTC): {source.recorded_at.isoformat()}", 8)
    line("Issue and validity fields use Grenada time (UTC−04:00).", 8)
    line(
        "Saved revision copy. Publication status does not confirm current validity.", 8
    )
    pdf.ln(4)
    for label, value in document_fields(source):
        line(label, 9)
        line(value)
        pdf.ln(3)
    return bytes(pdf.output())
