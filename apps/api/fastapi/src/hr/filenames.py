"""Download names for HR PDFs.

A person's name appears only for signed documents, where the signer's name is
already printed on the document. Names never go into URLs; only headers.
"""

from datetime import date, datetime

from src.utils.filenames import grenada_date, pdf_filename

FORM_TITLES = {
    "leave_request": "Leave Application",
    "shift_swap": "Shift Exchange",
    "absentee_report": "Absentee Report",
    "status_report": "Daily Status Report",
    "timesheet": "Timesheet",
    "parking_permit": "Parking Access Application",
}


def signed_document_filename(
    entity_type: str, signer_name: str, signed_at: datetime, revision: int
) -> str:
    title = FORM_TITLES.get(entity_type, "Signed HR Document")
    return pdf_filename(
        title,
        signer_name,
        grenada_date(signed_at).isoformat(),
        note=f"rev {revision}" if revision > 1 else None,
    )


def preview_filename(entity_type: str, day: date | None = None) -> str:
    title = FORM_TITLES.get(entity_type, "HR Document")
    return pdf_filename(
        f"{title} Preview", (day or grenada_date()).isoformat(), note=None
    )


def timesheet_week_filename(period_start: date) -> str:
    return pdf_filename("Timesheet", f"week of {period_start.isoformat()}")
