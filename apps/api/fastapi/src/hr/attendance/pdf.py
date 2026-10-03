"""Printable weekly collection of recorded shifts, rendered in Python."""

from datetime import datetime
from html import escape
from pathlib import Path
from zoneinfo import ZoneInfo

from src.hr.signatures import service as signature_service

from .schemas import AttendanceWeekPublic


def render_week_pdf(week: AttendanceWeekPublic) -> bytes:
    from weasyprint import HTML  # type: ignore[import-untyped]

    def local(value: datetime | None) -> str:
        if value is None:
            return "—"
        from datetime import UTC

        return (
            value.replace(tzinfo=UTC)
            .astimezone(ZoneInfo("America/Grenada"))
            .strftime("%d %b %H:%M")
        )

    rows = "".join(
        f"<tr><td>{escape(shift.employee_name)}</td><td>{shift.shift_date}</td><td>{escape(shift.shift_code)}<br>{shift.availability.value.replace('_', ' ') if shift.availability.value != 'SCHEDULED' else ''}</td><td>{local(shift.arrived_at)}</td><td>{local(shift.departed_at)}</td><td>{shift.break_minutes}</td><td>{shift.elapsed_hours if shift.elapsed_hours is not None else '—'}</td><td>{shift.actual_hours if shift.actual_hours is not None else '—'}</td><td>{shift.review_status.value if shift.review_status else 'NOT SUBMITTED'}<br>{escape(shift.reviewer_name or '')}<br>{local(shift.reviewed_at) if shift.reviewed_at else ''}</td><td>{escape(shift.notes or '')}</td></tr>"
        for shift in week.shifts
    )
    font = (
        Path(__file__).parents[1] / "signatures/fonts/NotoSans-Regular.ttf"
    ).as_uri()
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
    @page {{ size: A4 landscape; margin: 13mm; }} @font-face {{ font-family: Noto; src: url('{font}'); }}
    body {{ font-family: Noto, sans-serif; font-size: 9pt; color: #111; }} header {{ text-align: center; }} h1 {{ font-size: 15pt; }}
    table {{ border-collapse: collapse; width: 100%; margin-top: 5mm; }} th, td {{ border: 0.3mm solid #555; padding: 2mm; text-align: left; }}
    thead {{ display: table-header-group; }} tr {{ break-inside: avoid; }} footer {{ margin-top: 6mm; font-size: 8pt; }}
    </style></head><body>{signature_service.gaa_letterhead("Weekly Shift Timesheet")}
    <p><strong>Sunday {week.period_start} through Saturday {week.period_end}</strong> · Grenada local time</p>
    <table><thead><tr><th>Employee</th><th>Shift start date</th><th>Shift</th><th>Arrival</th><th>Departure</th><th>Break min.</th><th>Elapsed h</th><th>Recorded work h</th><th>Supervisor / date</th><th>Remarks</th></tr></thead><tbody>{rows}</tbody></table>
    <p><strong>Supervisor-approved work: {week.approved_hours} hours.</strong> All recorded work: {week.recorded_hours} hours.</p>
    <footer>Each shift is reviewed separately. Pending, returned, rejected or cancelled records are excluded from the approved total.
    Overnight shifts remain with their scheduled start date; D attendance is counted once.
    Recorded break duration and hours do not determine pay, overtime or paid-break entitlement.</footer>
    </body></html>"""
    return bytes(HTML(string=html).write_pdf())
