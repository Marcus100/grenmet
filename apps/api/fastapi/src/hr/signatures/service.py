import base64
import binascii
import hashlib
import io
import json
import logging
import uuid
from datetime import datetime
from html import escape
from pathlib import Path
from typing import TypedDict
from zoneinfo import ZoneInfo

from fastapi.concurrency import run_in_threadpool
from fastapi.encoders import jsonable_encoder
from PIL import Image, ImageChops, UnidentifiedImageError
from pydantic import JsonValue
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.inspection import inspect

from src.auth.models import User
from src.exceptions import AppException
from src.hr.exceptions import HRValidationError
from src.hr.organisations import (
    department_for,
    permitted_departments,
    require_organisation_permission,
)
from src.utils.datetime import utc_now

from .models import SavedSignature, SignedDocument
from .schemas import SignaturePublic

logger = logging.getLogger(__name__)

TITLES = {
    "leave_request": "Application for Leave of Absence",
    "shift_swap": "Shift Exchange Requisition",
    "absentee_report": "Absentee Report",
    "status_report": "Daily Airport Status Report",
    "timesheet": "Official Time Sheet",
    "parking_permit": "Airport Security Parking Access",
}


def gaa_letterhead(title: str) -> str:
    """Original institutional images, bundled locally so PDFs need no network."""
    assets = Path(__file__).parent / "assets"
    airport = (assets / "mbia.png").as_uri()
    crest = (assets / "grenada-coat-of-arms.png").as_uri()
    return f'''<header style="position: relative; min-height: 23mm;">
    <img alt="Maurice Bishop International Airport" src="{airport}" style="position: absolute; left: 0; top: 0; width: 23mm; height: 20mm; object-fit: contain;">
    <img alt="Grenada coat of arms" src="{crest}" style="position: absolute; right: 0; top: 0; width: 23mm; height: 21mm; object-fit: contain;">
    <strong>GRENADA AIRPORTS AUTHORITY</strong><div>Maurice Bishop International Airport</div><div>St. George’s, Grenada, West Indies</div>
    <small style="display: block; margin-top: 3mm;">(Established 1985)</small><h1>{escape(title)}</h1></header>'''


def normalize_image(data_url: str) -> bytes:
    if not data_url.startswith("data:image/png;base64,"):
        raise HRValidationError("Upload or draw a PNG signature")
    try:
        raw = base64.b64decode(data_url.split(",", 1)[1], validate=True)
        if len(raw) > 256000:
            raise HRValidationError("Signature must be smaller than 250 KB")
        with Image.open(io.BytesIO(raw)) as source:
            if source.format != "PNG" or not (
                16 <= source.width <= 2000 and 16 <= source.height <= 1000
            ):
                raise HRValidationError(
                    "Signature dimensions must be 16–2000 by 16–1000 pixels"
                )
            rgba = source.convert("RGBA")
            image = Image.new("RGB", source.size, "white")
            image.paste(rgba, mask=rgba.getchannel("A"))
            if (
                ImageChops.difference(
                    image, Image.new("RGB", source.size, "white")
                ).getbbox()
                is None
            ):
                raise HRValidationError("Signature cannot be blank")
            image.thumbnail((800, 300))
            output = io.BytesIO()
            image.save(output, format="PNG")
            return output.getvalue()
    except (
        ValueError,
        binascii.Error,
        UnidentifiedImageError,
        OSError,
        Image.DecompressionBombError,
    ) as error:
        raise HRValidationError("Invalid PNG signature") from error


def public_signature(signature: SavedSignature) -> SignaturePublic:
    return SignaturePublic(
        version=signature.version,
        image_data_url="data:image/png;base64,"
        + base64.b64encode(signature.image).decode(),
        updated_at=signature.updated_at,
    )


async def save_signature(
    session: AsyncSession, actor: User, data_url: str
) -> SavedSignature:
    image = await run_in_threadpool(normalize_image, data_url)
    # Lock the user even for first upload, so two first uploads cannot race.
    await session.execute(select(User.id).where(User.id == actor.id).with_for_update())
    saved = await session.get(SavedSignature, actor.id, populate_existing=True)
    if saved is None:
        saved = SavedSignature(user_id=actor.id, image=image)
    else:
        saved.image = image
        saved.version = uuid.uuid4()
        saved.updated_at = utc_now()
    session.add(saved)
    await session.commit()
    logger.info("Saved signature updated", extra={"actor_id": str(actor.id)})
    return saved


async def delete_signature(session: AsyncSession, actor: User) -> None:
    await session.execute(select(User.id).where(User.id == actor.id).with_for_update())
    saved = await session.get(SavedSignature, actor.id, populate_existing=True)
    if saved:
        await session.delete(saved)
    await session.commit()


class DocumentSnapshot(TypedDict):
    organisation: str
    entity_type: str
    entity_id: str
    signer_name: str
    signed_at: str | None
    form: dict[str, JsonValue]


async def build_document_snapshot(
    *,
    session: AsyncSession,
    actor: User,
    entity_type: str,
    entity_id: str,
    department_id: str,
    values: dict[str, object],
    signed_at: datetime | None,
) -> DocumentSnapshot:
    """Resolve identity and department labels for both previews and signed copies."""
    from src.baseline.service import employment_for
    from src.hr.models import Organisation

    subject_id = uuid.UUID(
        str(values.get("user_id") or values.get("requesting_user_id") or actor.id)
    )
    subject = await session.get(User, subject_id)
    values["employee_name"] = subject.full_name if subject else str(subject_id)
    employment = await employment_for(session, subject_id)
    supervisor = (
        await session.get(User, employment.supervisor_id)
        if employment and employment.supervisor_id
        else None
    )
    values["supervisor_name"] = supervisor.full_name if supervisor else ""
    if entity_type == "shift_swap" and values.get("counterpart_user_id"):
        counterpart = await session.get(
            User, uuid.UUID(str(values["counterpart_user_id"]))
        )
        values["counterpart_name"] = counterpart.full_name if counterpart else ""
    acting_officer_id = values.get("acting_officer_id")
    if acting_officer_id:
        acting_officer = await session.get(User, uuid.UUID(str(acting_officer_id)))
        values["acting_officer_name"] = (
            acting_officer.full_name if acting_officer else ""
        )
    department = await department_for(session, department_id)
    values["department_name"] = department.name
    organisation = await session.get(Organisation, department.organisation_id)
    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "organisation": organisation.name
        if organisation
        else department.organisation_id,
        "signer_name": actor.full_name,
        "signed_at": signed_at.isoformat() if signed_at else None,
        "form": jsonable_encoder(values),
    }


def render_leave_pdf(snapshot: DocumentSnapshot, image: bytes | None) -> bytes:
    """Render the GAA leave sheet for the live preview and immutable signed copy."""
    from weasyprint import HTML  # type: ignore[import-untyped]

    form = snapshot["form"]

    def value(key: str) -> str:
        raw = form.get(key)
        return escape(str(raw)) if raw is not None and raw != "" else "—"

    def choice(label: str, selected: bool) -> str:
        mark = "✓" if selected else ""
        return f'<span class="choice">{escape(label)} <span class="box">{mark}</span></span>'

    leave_type = str(form.get("leave_type") or "")
    leave_options = "".join(
        choice(label, leave_type == code)
        for label, code in (
            ("Annual Vacation", "VACATION"),
            ("Maternity Leave", "MATERNITY"),
            ("Professional Appointment", "PROFESSIONAL_APPOINTMENT"),
            ("Family Bereavement", "BEREAVEMENT"),
            ("Paternity Leave", "PATERNITY"),
            ("Other", "OTHER"),
        )
    )
    signature = (
        '<img class="signature" alt="Employee signature" src="data:image/png;base64,'
        + base64.b64encode(image).decode()
        + '">'
        if image
        else '<span class="pending">Not signed</span>'
    )
    submitted = snapshot["signed_at"]
    grenada_time = ZoneInfo("America/Grenada")
    document_date = (
        datetime.fromisoformat(submitted).astimezone(grenada_time).date()
        if submitted
        else datetime.now(grenada_time).date()
    )
    font_url = (Path(__file__).parent / "fonts" / "NotoSans-Regular.ttf").as_uri()
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face {{ font-family: Document; src: url('{font_url}'); }}
    @page {{ size: A4; margin: 11mm 15mm; }}
    body {{ font-family: Document, sans-serif; color: #111827; font-size: 8pt; line-height: 1.2; }}
    h1, h2, p {{ margin: 0; }}
    header {{ text-align: center; margin-bottom: 4mm; }}
    header strong {{ display: block; font-size: 11pt; }}
    header h1 {{ font-size: 10pt; margin-top: 2mm; letter-spacing: .03em; }}
    header small {{ display: block; margin-top: 1mm; }}
    h2 {{ font-size: 8.5pt; text-align: center; margin: 3mm 0 2mm; border-top: 1px solid #4b5563; padding-top: 2mm; }}
    table {{ border-collapse: collapse; width: 100%; }}
    td {{ width: 50%; padding: 1.3mm 2mm 1.3mm 0; vertical-align: top; }}
    .label {{ color: #4b5563; font-size: 7pt; display: block; }}
    .answer {{ border-bottom: 1px solid #9ca3af; min-height: 3.5mm; display: block; padding-top: .3mm; }}
    .choices {{ line-height: 2; }}
    .choice {{ display: inline-block; margin-right: 4mm; white-space: nowrap; }}
    .box {{ display: inline-block; width: 2.8mm; height: 2.8mm; border: 1px solid #4b5563; text-align: center; line-height: 2.8mm; vertical-align: middle; }}
    .row {{ margin: 1.5mm 0; }} .muted {{ color: #4b5563; }}
    .signature {{ max-width: 42mm; max-height: 10mm; object-fit: contain; }}
    .pending {{ color: #6b7280; font-style: italic; }}
    .approval td {{ padding-top: 1.5mm; }}
    footer {{ margin-top: 3mm; font-size: 7pt; color: #6b7280; }}
    </style></head><body>
    {gaa_letterhead("APPLICATION FOR LEAVE OF ABSENCE")}
    <table><tr><td><span class="label">Employee Name</span><span class="answer">{value("employee_name")}</span></td><td><span class="label">Department</span><span class="answer">{value("department_name")}</span></td></tr>
    <tr><td><span class="label">Employee request for leave (days)</span><span class="answer">{value("days_requested")}</span></td><td><span class="label">Start Date / End Date</span><span class="answer">{value("start_date")} / {value("end_date")}</span></td></tr></table>
    <h2>TYPE OF LEAVE OF ABSENCE</h2><div class="choices">{leave_options}</div>
    <table><tr><td><span class="label">Professional appointment (Bank / Medical / Legal / Dental)</span>{value("professional_appointment_subtype")}</td><td><span class="label">Other — state reason</span>{value("reason")}</td></tr></table>
    <div class="row">Salary in advance: {choice("Yes", form.get("salary_in_advance") is True)} &nbsp; {choice("No", form.get("salary_in_advance") is False)}</div>
    <table><tr><td><span class="label">Where is the leave to be spent?</span><span class="answer">{value("leave_address")}</span></td><td><span class="label">Travel From / To</span><span class="answer">{value("travel_from_date")} / {value("travel_to_date")}</span></td></tr>
    <tr><td><span class="label">Employee Signature</span><span class="answer">{signature}</span></td><td><span class="label">Date (Grenada)</span><span class="answer">{document_date.isoformat()}</span></td></tr></table>
    <h2>APPROVAL</h2>
    <div class="row">Acting appointment required: {choice("Yes", form.get("requires_acting_appointment") is True)} &nbsp; {choice("No", form.get("requires_acting_appointment") is False)}</div>
    <table><tr><td><span class="label">Acting officer</span><span class="answer">{value("acting_officer_name")}</span></td><td><span class="label">Decision</span><span class="answer">See approval workflow</span></td></tr></table>
    <div class="row"><span class="label">Comments</span><span class="answer">{value("head_of_dept_comments")}</span></div>
    <table class="approval"><tr><td><span class="label">Supervisor</span><span class="answer">{value("supervisor_name")}</span></td><td><span class="label">Signature / Date</span><span class="answer">See approval workflow</span></td></tr>
    <tr><td><span class="label">Department Manager</span><span class="answer">—</span></td><td><span class="label">Signature / Date</span><span class="answer">See approval workflow</span></td></tr>
    <tr><td><span class="label">Divisional Director of Operations</span><span class="answer">—</span></td><td><span class="label">Signature / Date</span><span class="answer">See approval workflow</span></td></tr>
    <tr><td><span class="label">CEO</span><span class="answer">—</span></td><td><span class="label">Signature / Date</span><span class="answer">See approval workflow</span></td></tr></table>
    <h2>HUMAN RESOURCES DEPT. OFFICIAL ONLY</h2>
    <table><tr><td><span class="label">Previous balance / Days requested / New balance</span><span class="answer">— / {value("days_requested")} / —</span></td><td><span class="label">Expected return to work</span><span class="answer">{value("expected_return_date")}</span></td></tr></table>
    <div class="row"><span class="label">HR signature / date</span><span class="answer">See approval workflow</span></div>
    <footer>Reference: {escape(snapshot["entity_id"])} · {escape(snapshot["organisation"])} · {("Signed by " + escape(snapshot["signer_name"])) if image else "Draft preview"}</footer>
    </body></html>"""
    pdf = HTML(string=html, base_url=str(Path(__file__).parent)).write_pdf()
    if not isinstance(pdf, bytes):
        raise TypeError("WeasyPrint returned no PDF bytes")
    return pdf


def render_absentee_pdf(snapshot: DocumentSnapshot, image: bytes | None) -> bytes:
    """Preserve the original absentee fields and distinguish reporter from subject."""
    from weasyprint import HTML

    form = snapshot["form"]

    def value(key: str) -> str:
        raw = form.get(key)
        return escape(str(raw)) if raw is not None and raw != "" else "—"

    reasons = "".join(
        f'<div class="choice"><span class="box">{("✓" if form.get("reason") == code else "")}</span> {label}</div>'
        for code, label in (
            ("UNCERTIFIED_SICK", "Uncertified Sick"),
            ("ILLNESS_FAMILY_MEMBER", "Illness (family member)"),
            ("ILLNESS_ON_JOB", "Illness on the Job"),
            ("TIME_OFF", "Time Off"),
            ("OTHER", "Other"),
        )
    )
    signature = (
        '<img class="signature" alt="Reporter signature" src="data:image/png;base64,'
        + base64.b64encode(image).decode()
        + '">'
        if image
        else "Not signed — draft preview"
    )
    signed_at = snapshot["signed_at"]
    submission_date = (
        datetime.fromisoformat(signed_at)
        .astimezone(ZoneInfo("America/Grenada"))
        .strftime("%Y-%m-%d %H:%M")
        if signed_at
        else "Not submitted"
    )
    font_url = (Path(__file__).parent / "fonts" / "NotoSans-Regular.ttf").as_uri()
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face {{ font-family: Document; src: url('{font_url}'); }}
    @page {{ size: A4; margin: 18mm; }}
    body {{ font-family: Document, sans-serif; font-size: 9pt; color: #111827; line-height: 1.4; }}
    header {{ text-align: center; margin-bottom: 9mm; }}
    header strong {{ display: block; font-size: 12pt; }}
    h1 {{ font-size: 11pt; margin: 6mm 0 0; }}
    table {{ width: 100%; border-collapse: collapse; }}
    td {{ width: 50%; padding: 2mm 4mm 2mm 0; vertical-align: top; }}
    .label {{ display: block; color: #4b5563; font-size: 8pt; }}
    .answer {{ display: block; border-bottom: 1px solid #9ca3af; min-height: 5mm; }}
    .choices {{ columns: 2; margin: 3mm 0 6mm; }}
    .choice {{ margin-bottom: 3mm; break-inside: avoid; }}
    .box {{ display: inline-block; width: 3.5mm; height: 3.5mm; border: 1px solid #4b5563; text-align: center; line-height: 3.5mm; }}
    .notes {{ white-space: pre-wrap; overflow-wrap: anywhere; min-height: 20mm; border-bottom: 1px solid #9ca3af; margin-bottom: 6mm; }}
    .signature {{ max-width: 45mm; max-height: 12mm; object-fit: contain; }}
    .approvals {{ margin-top: 5mm; }}
    .pending, footer {{ color: #6b7280; font-size: 8pt; }}
    footer {{ margin-top: 6mm; }}
    </style></head><body>
    {gaa_letterhead("ABSENTEE REPORT")}
    <table><tr><td><span class="label">Employee Name</span><span class="answer">{value("employee_name")}</span></td><td><span class="label">Date of absence</span><span class="answer">{value("report_date")}</span></td></tr>
    <tr><td><span class="label">Department</span><span class="answer">{value("department_name")}</span></td><td><span class="label">Expected shift / Absence from — to</span><span class="answer">{value("expected_shift_code")} / {value("absence_start_time")} — {value("absence_end_time")}</span></td></tr></table>
    <p>The above employee was absent from work on the above date for the reason checked:</p>
    <strong>CHECK REASON</strong><div class="choices">{reasons}</div>
    <span class="label">Reason(s)</span><div class="notes">{value("notes")}</div>
    <table><tr><td><span class="label">Reported by</span><span class="answer">{escape(snapshot["signer_name"])}</span></td><td><span class="label">Submitted (Grenada local time)</span><span class="answer">{submission_date}</span></td></tr>
    <tr><td><span class="label">Reporter’s Signature</span>{signature}</td><td><span class="label">Review status</span><span class="pending">Approval is recorded separately in the workflow.</span></td></tr></table>
    <table class="approvals"><tr><td><span class="label">Supervisor</span><span class="answer">{value("supervisor_name")}</span></td><td><span class="label">Supervisor’s Signature / Date</span><span class="answer pending">Pending — see approval workflow</span></td></tr>
    <tr><td><span class="label">Department Manager Signature</span><span class="answer pending">Pending — see approval workflow</span></td><td><span class="label">Date</span><span class="answer pending">See approval workflow</span></td></tr></table>
    <p class="pending">Please note: A reason must be provided by the employee for uncertified sick or illness on the job and documented on the form. Complete one report for each date of absence and submit it for supervisor review.</p>
    <footer>Reference: {escape(snapshot["entity_id"])} · {escape(snapshot["organisation"])} · {("Signed submission" if image else "Draft preview")}</footer>
    </body></html>"""
    pdf = HTML(string=html, base_url=str(Path(__file__).parent)).write_pdf()
    if not isinstance(pdf, bytes):
        raise TypeError("WeasyPrint returned no PDF bytes")
    return pdf


def render_shift_exchange_pdf(snapshot: DocumentSnapshot, image: bytes | None) -> bytes:
    """Original exchange fields, using the same renderer for preview and signing."""
    from weasyprint import HTML

    def value(key: str) -> str:
        raw = snapshot["form"].get(key)
        return escape(str(raw)) if raw is not None and raw != "" else "—"

    signature = (
        (
            '<img class="signature" alt="Requesting employee signature" src="data:image/png;base64,'
            + base64.b64encode(image).decode()
            + '">'
        )
        if image
        else "Not signed — draft preview"
    )
    submitted = snapshot["signed_at"]
    date_label = (
        datetime.fromisoformat(submitted)
        .astimezone(ZoneInfo("America/Grenada"))
        .strftime("%Y-%m-%d %H:%M")
        if submitted
        else "Not submitted"
    )
    font_url = (Path(__file__).parent / "fonts" / "NotoSans-Regular.ttf").as_uri()
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face {{ font-family: Document; src: url('{font_url}'); }}
    @page {{ size: A4; margin: 16mm; }}
    body {{ font-family: Document, sans-serif; font-size: 9pt; line-height: 1.4; color: #111827; }}
    header {{ text-align: center; margin-bottom: 7mm; }} header strong {{ font-size: 12pt; }}
    h1 {{ font-size: 11pt; margin-top: 5mm; }} h2 {{ font-size: 10pt; margin-top: 7mm; border-top: 1px solid #6b7280; padding-top: 3mm; }}
    .field {{ margin: 3mm 0; }} .label {{ display: block; font-size: 8pt; color: #4b5563; }}
    .answer {{ min-height: 5mm; border-bottom: 1px solid #9ca3af; }} .notes {{ white-space: pre-wrap; overflow-wrap: anywhere; min-height: 12mm; }}
    table {{ width: 100%; border-collapse: collapse; }} td {{ width: 50%; padding: 2mm 5mm 2mm 0; vertical-align: top; }}
    .signature {{ max-width: 45mm; max-height: 12mm; }} .pending, footer {{ color: #6b7280; font-size: 8pt; }} footer {{ margin-top: 6mm; }}
    </style></head><body>
    {gaa_letterhead("SHIFT EXCHANGE REQUISITION FORM")}
    <div class="field"><span class="label">Department</span><div class="answer">{value("department_name")}</div></div>
    <div class="field"><span class="label">Name of employee requesting change</span><div class="answer">{value("employee_name")}</div></div>
    <div class="field"><span class="label">Name of employee with whom change is desired</span><div class="answer">{value("counterpart_name")}</div></div>
    <table><tr><td><span class="label">Date &amp; shift requested for change</span><div class="answer">{value("source_date")} — {value("source_shift_code")}</div></td><td><span class="label">Date &amp; shift of return shift</span><div class="answer">{value("target_date")} — {value("target_shift_code")}</div></td></tr></table>
    <div class="field"><span class="label">Reason(s) for request</span><div class="answer notes">{value("reason")}</div></div>
    <table><tr><td><span class="label">Name / signature of requesting employee</span><div>{value("employee_name")}</div>{signature}</td><td><span class="label">Submitted (Grenada local time)</span><div class="answer">{date_label}</div></td></tr>
    <tr><td><span class="label">Name of employee agreeing to the change</span><div class="answer">{value("counterpart_name")}</div></td><td><span class="label">Signature / agreement date</span><div class="answer pending">Required first-stage approval — see workflow</div></td></tr></table>
    <h2>Supervisor’s Recommendation</h2><div class="pending">Yes / No and reasons are recorded in the approval workflow.</div>
    <table><tr><td><span class="label">Supervisor</span><div class="answer">{value("supervisor_name")}</div></td><td><span class="label">Signature / Date</span><div class="answer pending">See approval workflow</div></td></tr></table>
    <h2>For Official Use Only</h2><div class="pending">Approved: Yes / No · If No, reasons are recorded in the workflow.</div>
    <table><tr><td><span class="label">Signature: Manager of Department</span><div class="answer pending">See approval workflow</div></td><td><span class="label">Date</span><div class="answer pending">See approval workflow</div></td></tr>
    <tr><td><span class="label">Human Resource Department: Signature</span><div class="answer pending">See approval workflow</div></td><td><span class="label">Date</span><div class="answer pending">See approval workflow</div></td></tr></table>
    <footer>Reference: {escape(snapshot["entity_id"])} · {escape(snapshot["organisation"])} · {("Signed submission" if image else "Draft preview")}<br>Shift dates refer to the local shift start date, including overnight shifts.</footer>
    </body></html>"""
    pdf = HTML(string=html, base_url=str(Path(__file__).parent)).write_pdf()
    if not isinstance(pdf, bytes):
        raise TypeError("WeasyPrint returned no PDF bytes")
    return pdf


def render_pdf(snapshot: DocumentSnapshot, image: bytes | None) -> bytes:
    if snapshot["entity_type"] == "parking_permit":
        from src.hr.parking.pdf import render_parking_pdf

        return render_parking_pdf(snapshot, image)
    if snapshot["entity_type"] == "shift_swap":
        return render_shift_exchange_pdf(snapshot, image)
    if snapshot["entity_type"] == "status_report":
        from src.hr.dailystatus.pdf import render_status_pdf

        return render_status_pdf(snapshot, image)
    if snapshot["entity_type"] == "leave_request":
        return render_leave_pdf(snapshot, image)
    if snapshot["entity_type"] == "absentee_report":
        return render_absentee_pdf(snapshot, image)
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_page()
    pdf.add_font(
        "Document", fname=str(Path(__file__).parent / "fonts" / "NotoSans-Regular.ttf")
    )
    pdf.set_font("Document", size=10)

    def line(text: str) -> None:
        pdf.multi_cell(0, 6, text, new_x="LMARGIN", new_y="NEXT")

    pdf.set_font("Document", size=16)
    line(snapshot["organisation"])
    pdf.ln(3)
    pdf.set_font("Document", size=13)
    line(TITLES[snapshot["entity_type"]])
    pdf.ln(3)
    pdf.set_font("Document", size=9)
    line(f"Document reference: {snapshot['entity_id']}")
    pdf.ln(4)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(4)
    pdf.set_font("Document", size=10)

    def fields(values: dict[str, JsonValue]) -> None:
        for key, value in values.items():
            if value is None or key in {
                "workflow_instance_id",
                "created_at",
                "updated_at",
            }:
                continue
            label = key.replace("_", " ").capitalize()
            if isinstance(value, list):
                line(label)
                for index, entry in enumerate(value, 1):
                    line(f"Entry {index}")
                    if isinstance(entry, dict):
                        fields(entry)
            else:
                line(f"{label}: {value}")

    fields(snapshot["form"])
    pdf.ln(5)
    if pdf.get_y() > 235:
        pdf.add_page()
    line(f"Signed and submitted by: {snapshot['signer_name']}")
    line(f"Signed at (UTC): {snapshot['signed_at']}")
    if image:
        pdf.image(
            io.BytesIO(image),
            x=pdf.l_margin,
            y=pdf.get_y(),
            w=65,
            h=25,
            keep_aspect_ratio=True,
        )
        pdf.ln(28)
        line("I confirm this submission and apply my saved signature.")
    return bytes(pdf.output())


async def capture(
    *,
    session: AsyncSession,
    actor: User,
    entity: object,
    entity_type: str,
    signature_version: uuid.UUID | None,
) -> None:
    """Called only after the form service authorizes submission; never commits."""
    await session.execute(select(User.id).where(User.id == actor.id).with_for_update())
    inspected_entity = inspect(entity)
    assert inspected_entity is not None
    values = {
        attribute.key: getattr(entity, attribute.key)
        for attribute in inspected_entity.mapper.column_attrs
    }
    entity_id = uuid.UUID(str(values["id"]))
    existing = await session.scalar(
        select(SignedDocument)
        .where(
            SignedDocument.entity_type == entity_type,
            SignedDocument.entity_id == entity_id,
        )
        .order_by(SignedDocument.revision.desc())
        .limit(1)
    )
    if existing:
        from src.hr.workflow.models import WorkflowInstance, WorkflowStatus

        workflow_id = values.get("workflow_instance_id")
        workflow = (
            await session.get(WorkflowInstance, workflow_id) if workflow_id else None
        )
        if (
            workflow is None
            or workflow.entity_id != entity_id
            or workflow.entity_type != entity_type
            or workflow.status != WorkflowStatus.PENDING
            or workflow.submitted_at is None
            or workflow.submitted_at <= existing.signed_at
        ):
            raise HRValidationError("This submission has already been signed")
        if signature_version is None:
            raise HRValidationError(
                "Review and sign the corrected form before resubmitting"
            )
    if signature_version is None:
        return
    saved = await session.get(SavedSignature, actor.id, populate_existing=True)
    if saved is None or saved.version != signature_version:
        raise HRValidationError(
            "Your saved signature changed or was deleted. Review it again before signing."
        )
    if entity_type == "timesheet":
        from src.hr.timesheet.models import TimesheetEntry

        entries = (
            (
                await session.execute(
                    select(TimesheetEntry)
                    .where(TimesheetEntry.timesheet_id == entity_id)
                    .order_by(TimesheetEntry.entry_date, TimesheetEntry.id)
                )
            )
            .scalars()
            .all()
        )
        values["entries"] = [
            {
                attribute.key: getattr(entry, attribute.key)
                for attribute in inspect(entry).mapper.column_attrs
            }
            for entry in entries
        ]
    elif entity_type == "status_report":
        from src.hr.dailystatus.models import StatusReportEntry

        status_entries = (
            (
                await session.execute(
                    select(StatusReportEntry)
                    .where(StatusReportEntry.status_report_id == entity_id)
                    .order_by(StatusReportEntry.id)
                )
            )
            .scalars()
            .all()
        )
        name_rows = await session.execute(
            select(
                User.id, func.trim(func.concat(User.first_name, " ", User.last_name))
            ).where(User.id.in_([entry.user_id for entry in status_entries]))
        )
        status_names = {user_id: str(name) for user_id, name in name_rows}
        values["entries"] = [
            {
                "employee_name": status_names[entry.user_id],
                **{
                    attribute.key: getattr(entry, attribute.key)
                    for attribute in inspect(entry).mapper.column_attrs
                },
            }
            for entry in status_entries
        ]
    signed_at = utc_now()
    snapshot = await build_document_snapshot(
        session=session,
        actor=actor,
        entity_type=entity_type,
        entity_id=str(entity_id),
        department_id=str(values["department_id"]),
        values=values,
        signed_at=signed_at,
    )
    pdf = await run_in_threadpool(render_pdf, snapshot, saved.image)
    subject_id = uuid.UUID(
        str(values.get("user_id") or values.get("requesting_user_id") or actor.id)
    )
    department = await department_for(session, str(values["department_id"]))
    session.add(
        SignedDocument(
            entity_type=entity_type,
            entity_id=entity_id,
            revision=existing.revision + 1 if existing else 1,
            supersedes_document_id=existing.id if existing else None,
            signer_id=actor.id,
            subject_id=subject_id,
            department_id=department.id,
            signer_name=actor.full_name,
            signature_version=saved.version,
            signed_at=signed_at,
            snapshot=json.dumps(snapshot, sort_keys=True),
            pdf=pdf,
            sha256=hashlib.sha256(pdf).hexdigest(),
        )
    )
    await session.flush()
    logger.info(
        "HR document signed",
        extra={"actor_id": str(actor.id), "entity_id": str(entity_id)},
    )


async def get_document(
    session: AsyncSession, actor: User, document_id: uuid.UUID
) -> SignedDocument:
    record = await session.get(SignedDocument, document_id)
    if record is None:
        raise AppException("Signed document not found", 404)
    if record.entity_type == "shift_swap":
        from src.hr.exchange.models import ShiftSwapRequest

        exchange = await session.get(ShiftSwapRequest, record.entity_id)
        if exchange is not None and exchange.counterpart_user_id == actor.id:
            return record
    if actor.id not in {record.signer_id, record.subject_id}:
        department = await department_for(session, record.department_id)
        for key in ("hr.document.read.department", "hr.document.manage"):
            departments = await permitted_departments(
                session, actor, department.organisation_id, key
            )
            if record.department_id not in departments:
                continue
            try:
                # SELF grants never confer access to another employee's evidence.
                await require_organisation_permission(
                    session,
                    actor,
                    department.organisation_id,
                    key,
                    record.department_id,
                )
            except AppException as error:
                if error.status_code != 403:
                    raise
            else:
                break
        else:
            raise AppException("Not allowed to read this signed document", 403)
    return record


async def list_documents(
    session: AsyncSession, actor: User, skip: int, limit: int
) -> tuple[list[SignedDocument], int]:
    query = select(SignedDocument).where(
        (SignedDocument.signer_id == actor.id) | (SignedDocument.subject_id == actor.id)
    )
    count = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = (
        (
            await session.execute(
                query.order_by(SignedDocument.signed_at.desc(), SignedDocument.id)
                .offset(skip)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    return list(rows), count or 0
