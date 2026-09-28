"""The supplied Vehicle Pass form, shared by previews and signed evidence."""

import base64
from datetime import datetime
from html import escape
from pathlib import Path
from zoneinfo import ZoneInfo

from src.hr.signatures.service import DocumentSnapshot, gaa_letterhead

RULES = (
    "A $40.00 fee is charged for each vehicle decal for one year, or any part thereof.",
    "The Decal MUST be affixed to the left side of the vehicle’s windscreen, above the Licence Disc.",
    "Any changes in the authorized vehicle or driver operating it under this permit shall be made by contacting the Airport Security Office.",
    "Lost or Stolen decals must be reported immediately.",
    "The applicant and permitee operating under this permit agree to indemnify and save forever harmless the Grenada Airports Authority, its Agents and employees from any and all loss, claim, damages, injury or death arising directly or indirectly out of the issuance of this decal or its use by any person.",
    "Any vehicle parked in an unauthorized area without the most recent vehicle decal affixed to the windscreen is in violation of applicable airport rules and regulations and will be subject to Impounding.",
    "If applicant intends to sell his/her vehicle or the vehicle is no longer owned by the applicant, the decal issued should be removed and returned to the Pass Control office immediately.",
    "Parking privilege is only extended to the applicant of the vehicle decal.",
)


def render_parking_pdf(snapshot: DocumentSnapshot, image: bytes | None) -> bytes:
    from weasyprint import HTML  # type: ignore[import-untyped]

    form = snapshot["form"]

    def value(key: str) -> str:
        raw = form.get(key)
        return escape(str(raw)) if raw is not None and raw != "" else "—"

    document_date = (
        datetime.fromisoformat(str(form.get("created_at") or snapshot["signed_at"]))
        .astimezone(ZoneInfo("America/Grenada"))
        .date()
        .isoformat()
        if form.get("created_at") or snapshot["signed_at"]
        else datetime.now(ZoneInfo("America/Grenada")).date().isoformat()
    )
    options = " · ".join(
        f"{'☑' if form.get('action_requested') == code else '☐'} {label}"
        for code, label in (
            ("NEW_PERMIT", "New Permit"),
            ("ANNUAL_RENEWAL", "Annual Renewal"),
            ("REPLACEMENT_LOST_STOLEN", "Replacement (Lost/Stolen)"),
            ("INFORMATION_CHANGE", "Information Change"),
            ("OTHER", "Other"),
        )
    )
    signature = (
        '<img class="signature" alt="Applicant signature" src="data:image/png;base64,'
        + base64.b64encode(image).decode()
        + '">'
        if image
        else "Not signed"
    )
    rules = "".join(f"<li>{escape(rule)}</li>" for rule in RULES)
    font = (
        Path(__file__).parents[1] / "signatures/fonts/NotoSans-Regular.ttf"
    ).as_uri()
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face {{ font-family: Document; src: url('{font}'); }}
    @page {{ size: A4; margin: 13mm; @bottom-center {{ content: 'GAA • Parking access application'; font: 8pt Document; }} }}
    body {{ font: 9pt Document; color: #111; }}
    header {{ text-align:center; margin-bottom: 8mm; }}
    .gaa-letterhead img {{ max-height:18mm; max-width:30mm; }}
    h1 {{ font-size:14pt; }} h2 {{ font-size:10pt; margin-top:5mm; }}
    table {{ width:100%; border-collapse:collapse; }} td,th {{ border:1px solid #aaa; padding:2mm; text-align:left; }}
    th {{ font-weight:bold; }} ul {{ padding-left:5mm; }} li {{ margin-bottom:2mm; }}
    .signature {{ max-width:35mm; max-height:12mm; }} .muted {{ font-size:8pt; }}
    </style></head><body>{gaa_letterhead("PARKING ACCESS APPLICATION")}
    <p><b>AIRPORT SECURITY</b> · Application date: {document_date}</p>
    <table><tr><th>Company name</th><td>{value("company_name")}</td><th>Department</th><td>{value("department_name")}</td></tr>
    <tr><th>Employee name</th><td>{value("employee_name")}</td><th>Phone</th><td>{value("phone")}</td></tr>
    <tr><th>Vehicle registration</th><td>{value("vehicle_registration_no")}</td><th>Recorded fee</th><td>${value("fee_amount")}</td></tr>
    <tr><th>Insurance issue date</th><td>{value("vehicle_insurance_issue_date")}</td><th>Insurance expiry date</th><td>{value("vehicle_insurance_expiry_date")}</td></tr></table>
    <p><b>Action requested:</b> {options}</p><p><b>Other:</b> {value("action_other_detail")}</p>
    <ul>{rules}</ul>
    <table><tr><th>Applicant / reporter</th><td>{escape(snapshot["signer_name"])}</td><td>{signature}</td><td>{escape(snapshot["signed_at"] or "Not signed")}</td></tr>
    <tr><th>Company authorizing / department head</th><td>{value("supervisor_name")}</td><td colspan="2">Pending authorized workflow approval</td></tr></table>
    <h2>DECAL ISSUANCE</h2><table><tr><th>Decal number</th><td>{value("decal_number")}</td><th>Received by (print name)</th><td>{value("received_by")}</td></tr>
    <tr><th>Valid from</th><td>{value("valid_from")}</td><th>Valid to</th><td>{value("valid_to")}</td></tr><tr><th>Date issued</th><td colspan="3">{value("issued_at")}</td></tr></table>
    <h2>AIRPORT USE ONLY</h2><p>Authorizing Security Manager: recorded through the configured approval workflow.<br>Request processed by / date: recorded with decal issuance. No recipient signature is implied by a printed name.</p>
    <p class="muted">Reference: {escape(snapshot["entity_id"])} · {"Submitted evidence; later issuance does not alter this signed copy." if image else "Draft preview; no approval or signature is implied."}</p>
    </body></html>"""
    pdf: bytes = HTML(string=html).write_pdf()
    return pdf
