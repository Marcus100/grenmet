"""One renderer for daily status draft previews and immutable signed output."""

import base64
from datetime import datetime
from html import escape
from pathlib import Path
from zoneinfo import ZoneInfo

from src.hr.signatures.service import DocumentSnapshot, gaa_letterhead


def render_status_pdf(snapshot: DocumentSnapshot, image: bytes | None) -> bytes:
    from weasyprint import HTML  # type: ignore[import-untyped]

    form = snapshot["form"]

    def value(key: str) -> str:
        return escape(str(form.get(key) or ""))

    def answer(key: str) -> str:
        return (
            "Yes"
            if form.get(key) is True
            else "No"
            if form.get(key) is False
            else "Unconfirmed"
        )

    def question(label: str, key: str, explanation: str) -> str:
        return f'<p><b>{label}</b> {answer(key)}</p><div class="answer">{value(explanation)}</div>'

    rows = ""
    entries = form.get("entries")
    if isinstance(entries, list):
        for entry in entries:
            if isinstance(entry, dict):
                cells = [
                    entry.get("employee_name") or entry.get("user_id"),
                    entry.get("personnel_status"),
                    entry.get("arrival_time"),
                    entry.get("departure_time"),
                    entry.get("notes"),
                ]
                rows += (
                    "<tr>"
                    + "".join(f"<td>{escape(str(cell or ''))}</td>" for cell in cells)
                    + "</tr>"
                )
    signed_at = snapshot["signed_at"]
    stamp = (
        datetime.fromisoformat(signed_at)
        .astimezone(ZoneInfo("America/Grenada"))
        .strftime("%d %b %Y %H:%M %Z")
        if signed_at
        else "Draft — not submitted"
    )
    signature = (
        f'<img class="signature" src="data:image/png;base64,{base64.b64encode(image).decode()}" />'
        if image
        else ""
    )
    font = (
        Path(__file__).parents[1] / "signatures/fonts/NotoSans-Regular.ttf"
    ).as_uri()
    html = f"""<html><head><style>
    @font-face {{font-family: Document; src: url('{font}')}}
    @page {{size: A4; margin: 16mm}}
    body {{font-family: Document; font-size: 9pt; color: #111}}
    header {{text-align: center}} h1 {{font-size: 14pt; margin: 4mm 0}} h2 {{font-size: 10pt; margin-top: 5mm}}
    p {{margin: 2mm 0}} table {{width: 100%; border-collapse: collapse; margin: 3mm 0}}
    th,td {{border: 0.3mm solid #aaa; padding: 2mm; text-align: left; overflow-wrap: anywhere}}
    tr {{break-inside: avoid}} thead {{display: table-header-group}}
    .answer {{white-space: pre-wrap; min-height: 5mm; border-bottom: 0.2mm solid #aaa; padding-bottom: 1mm; overflow-wrap: anywhere}}
    .signature {{width: 45mm; max-height: 15mm}} .approval {{break-inside: avoid; margin-top: 4mm}} .note {{font-size: 8pt}}
    </style></head><body>{gaa_letterhead("DAILY AIRPORT STATUS REPORT")}
    <table><tr><td>Department: {value("department_name")}</td><td>Date: {value("report_date")}</td><td>Shift: {value("shift_code")}</td></tr></table>
    <p>Absenteeism: {value("personnel_summary")}</p><p class="note">Comments on operational areas which may affect the status or efficiency of the airport. Dates refer to the local shift start; scheduled staffing is not proof of attendance.</p>
    <h2>PERSONNEL</h2>
    {question("Have all persons scheduled for the shift reported on time?", "all_personnel_reported_on_time", "personnel_explanation")}
    {question("Has this affected the status / efficiency of your operations?", "affected_operations", "affected_operations_explanation")}
    <h2>EQUIPMENT</h2>
    {question("Is all equipment under your jurisdiction operational?", "all_equipment_operational", "equipment_issue_reason")}
    <p>Action taken to remedy the situation:</p><div class="answer">{value("equipment_remedy_action")}</div>
    {question("Have all incident / accident reports been prepared and submitted to management?", "incident_reports_submitted", "incident_explanation")}
    <p>Operational status comments:</p><div class="answer">{value("general_remarks")}</div>
    <h2>SHIFT PERSONNEL</h2><table><thead><tr><th>Employee</th><th>Reported status</th><th>Arrival</th><th>Departure</th><th>Notes</th></tr></thead><tbody>{rows or '<tr><td colspan="5">No personnel entries recorded</td></tr>'}</tbody></table>
    <div class="approval"><p>Report submitted by: {escape(snapshot["signer_name"])}</p><p>Submission date: {escape(stamp)}</p>{signature}<p>Supervisor: {value("supervisor_name")}</p><table><tr><td>Supervisor’s signature / date: Pending — see approval workflow</td></tr><tr><td>Manager’s signature / date: Pending — see approval workflow</td></tr></table></div>
    <p class="note">Document reference: {escape(snapshot["entity_id"])}. Signed submissions preserve the submitted values. Approval evidence is retained in the workflow.</p></body></html>"""
    return bytes(HTML(string=html).write_pdf())
