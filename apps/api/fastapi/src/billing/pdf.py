"""Invoice PDF rendering (WeasyPrint, same approach as the HR and CAP PDFs).

CPU-bound and synchronous: call it through ``run_in_threadpool``.
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from html import escape
from pathlib import Path

from .calc import format_money


@dataclass(frozen=True)
class PdfLine:
    description: str
    quantity: Decimal
    unit_price_minor: int
    tax_rate: Decimal
    subtotal_minor: int


@dataclass(frozen=True)
class InvoiceDocument:
    number: str | None
    status: str
    legal_entity_name: str
    customer_name: str
    billing_email: str
    address: str | None
    issue_date: date | None
    due_date: date | None
    currency: str
    subtotal_minor: int
    tax_minor: int
    total_minor: int
    paid_minor: int
    notes: str | None
    lines: list[PdfLine]


_FONT = (
    Path(__file__).parents[1] / "hr/signatures/fonts/NotoSans-Regular.ttf"
).as_uri()


def _quantity(value: Decimal) -> str:
    text = f"{value:f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def render_invoice_html(doc: InvoiceDocument) -> str:
    def money(minor: int) -> str:
        return escape(format_money(minor, doc.currency))

    rows = "".join(
        "<tr>"
        f"<td>{escape(line.description)}</td>"
        f'<td class="n">{_quantity(line.quantity)}</td>'
        f'<td class="n">{money(line.unit_price_minor)}</td>'
        f'<td class="n">{line.tax_rate:.2f}%</td>'
        f'<td class="n">{money(line.subtotal_minor)}</td></tr>'
        for line in doc.lines
    )
    heading = (
        f"INVOICE {escape(doc.number)}" if doc.number else "INVOICE (DRAFT, NOT ISSUED)"
    )
    watermark = "" if doc.number else '<div class="mark">DRAFT</div>'
    void_mark = '<div class="mark">VOID</div>' if doc.status == "void" else ""
    address = escape(doc.address or "").replace("\n", "<br>")
    notes = (
        f"<h2>Notes</h2><p>{escape(doc.notes).replace(chr(10), '<br>')}</p>"
        if doc.notes
        else ""
    )
    outstanding = doc.total_minor - doc.paid_minor
    paid_rows = (
        f'<tr><th>Paid</th><td class="n">{money(doc.paid_minor)}</td></tr>'
        f'<tr><th>Balance due</th><td class="n">{money(outstanding)}</td></tr>'
        if doc.paid_minor
        else ""
    )
    issue = doc.issue_date.isoformat() if doc.issue_date else "Not issued"
    due = doc.due_date.isoformat() if doc.due_date else "Not set"
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
    @font-face {{ font-family: Document; src: url('{_FONT}'); }}
    @page {{ size: A4; margin: 16mm; @bottom-center {{ content: '{escape(doc.legal_entity_name)}'; font: 8pt Document; color: #555; }} }}
    body {{ font: 10pt Document; color: #111; }}
    h1 {{ font-size: 18pt; margin: 0 0 2mm; }} h2 {{ font-size: 11pt; margin: 6mm 0 2mm; }}
    .meta {{ width: 100%; margin-bottom: 6mm; }} .meta td {{ vertical-align: top; width: 50%; }}
    table.lines {{ width: 100%; border-collapse: collapse; }}
    table.lines th, table.lines td {{ border-bottom: 1px solid #bbb; padding: 2mm; text-align: left; }}
    .n {{ text-align: right !important; white-space: nowrap; }}
    table.totals {{ margin-left: auto; margin-top: 4mm; border-collapse: collapse; }}
    table.totals th, table.totals td {{ padding: 1.5mm 3mm; text-align: left; }}
    .mark {{ position: fixed; top: 110mm; left: 30mm; font-size: 90pt; color: #d0d0d0; transform: rotate(-30deg); z-index: -1; }}
    </style></head><body>{watermark}{void_mark}
    <h1>{heading}</h1>
    <p>{escape(doc.legal_entity_name)}</p>
    <table class="meta"><tr>
      <td><b>Bill to</b><br>{escape(doc.customer_name)}<br>{address}<br>{escape(doc.billing_email)}</td>
      <td><b>Issue date</b> {issue}<br><b>Due date</b> {due}<br><b>Currency</b> {escape(doc.currency)}</td>
    </tr></table>
    <table class="lines"><thead><tr><th>Description</th><th class="n">Qty</th><th class="n">Unit price</th><th class="n">VAT</th><th class="n">Amount</th></tr></thead>
    <tbody>{rows}</tbody></table>
    <table class="totals">
      <tr><th>Subtotal</th><td class="n">{money(doc.subtotal_minor)}</td></tr>
      <tr><th>VAT</th><td class="n">{money(doc.tax_minor)}</td></tr>
      <tr><th>Total</th><td class="n"><b>{money(doc.total_minor)}</b></td></tr>
      {paid_rows}
    </table>
    {notes}
    <h2>Payment</h2><p>Pay by bank transfer, cash or cheque to {escape(doc.legal_entity_name)}, quoting the invoice number.</p>
    </body></html>"""


def render_invoice_pdf(doc: InvoiceDocument) -> bytes:
    from weasyprint import HTML

    pdf: bytes = HTML(string=render_invoice_html(doc)).write_pdf()
    return pdf
