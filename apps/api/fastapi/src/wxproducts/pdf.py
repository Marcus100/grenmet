"""Render saved weather revisions without browser state or remote resources."""

from . import forecast_pdf
from .schemas import ProductPdfSource, values_as_dict


def publication_label(source: ProductPdfSource) -> str:
    if source.action == "draft":
        return "DRAFT — NOT FOR ISSUE"
    if source.action == "withdraw":
        return "WITHDRAWAL RECORD — NOT FOR ISSUE"
    if not source.current_publication:
        return "PUBLISHED ISSUE — ARCHIVE COPY"
    return "PUBLISHED ISSUE"


def render_product_pdf(source: ProductPdfSource) -> bytes:
    """Every product kind has a GMS sheet; saved revisions are archival PDF/A."""
    return forecast_pdf.render_sheet_pdf(
        source.kind,
        values_as_dict(source.values),
        status=publication_label(source),
        revision=(
            f"Revision r{source.revision} · recorded "
            f"{source.recorded_at:%Y-%m-%d %H:%M} UTC"
        ),
        archival=True,
    )
