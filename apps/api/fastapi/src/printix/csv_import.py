"""Read the printer's ticket list (CSV) and check it before anything is written.

The file needs a ``number`` column; ``barcode`` is optional and defaults to the
number. Header names are case-insensitive, a UTF-8 byte order mark from a
spreadsheet is accepted, and blank lines are skipped. Every problem is reported
with its line, so the operator can fix the file and dry-run it again. The parser
does no database work; the service checks the rows against tickets already on
the event.
"""

import csv
import io
from dataclasses import dataclass, field

from . import constants


@dataclass(frozen=True)
class ParsedRow:
    line: int
    number: str
    barcode: str


@dataclass(frozen=True)
class CsvIssue:
    line: int
    message: str


@dataclass(frozen=True)
class ParsedImport:
    rows: list[ParsedRow] = field(default_factory=list)
    errors: list[CsvIssue] = field(default_factory=list)
    row_count: int = 0
    errors_truncated: bool = False


def _fail(line: int, message: str) -> ParsedImport:
    return ParsedImport(errors=[CsvIssue(line, message)])


def _cell(row: list[str], index: int | None) -> str:
    if index is None or index >= len(row):
        return ""
    return row[index].strip()


def parse_ticket_csv(content: bytes) -> ParsedImport:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        return _fail(1, "The file is not UTF-8 text. Save it again as UTF-8 CSV.")

    reader = csv.reader(io.StringIO(text))
    rows: list[ParsedRow] = []
    issues: list[CsvIssue] = []
    seen_numbers: dict[str, int] = {}
    seen_barcodes: dict[str, int] = {}
    row_count = 0
    header_line = 1
    try:
        header: list[str] | None = None
        for cells in reader:
            if any(cell.strip() for cell in cells):
                header = cells
                break
        if header is None:
            return _fail(1, "The file is empty.")
        header_line = reader.line_num
        lowered = [name.strip().lower() for name in header]
        if "number" not in lowered:
            return _fail(header_line, "The first row needs a 'number' column.")
        number_index = lowered.index("number")
        barcode_index = lowered.index("barcode") if "barcode" in lowered else None

        for cells in reader:
            if not any(cell.strip() for cell in cells):
                continue
            line = reader.line_num
            row_count += 1
            if row_count > constants.MAX_IMPORT_ROWS:
                return ParsedImport(
                    errors=[
                        CsvIssue(
                            line,
                            f"The file has more rows than the limit: at most "
                            f"{constants.MAX_IMPORT_ROWS} ticket rows.",
                        )
                    ],
                    row_count=row_count,
                )
            number = _cell(cells, number_index)
            barcode = _cell(cells, barcode_index) or number
            problem = _check_row(line, number, barcode, seen_numbers, seen_barcodes)
            if problem is not None:
                issues.append(problem)
            else:
                rows.append(ParsedRow(line=line, number=number, barcode=barcode))
            if number:
                seen_numbers.setdefault(number, line)
            if barcode:
                seen_barcodes.setdefault(barcode, line)
    except csv.Error:
        issues.append(CsvIssue(reader.line_num, "The file is not readable CSV."))
    if row_count == 0 and not issues:
        issues.append(CsvIssue(header_line, "The file has no ticket rows."))

    truncated = len(issues) > constants.MAX_REPORTED_ERRORS
    return ParsedImport(
        rows=rows,
        errors=issues[: constants.MAX_REPORTED_ERRORS],
        row_count=row_count,
        errors_truncated=truncated,
    )


def _check_row(
    line: int,
    number: str,
    barcode: str,
    seen_numbers: dict[str, int],
    seen_barcodes: dict[str, int],
) -> CsvIssue | None:
    """The first problem with a row, or None. One problem per row keeps the
    report readable: a duplicate number also repeats its defaulted barcode."""
    if not number:
        return CsvIssue(line, "number is empty")
    if len(number) > constants.PRINTED_NUMBER_MAX:
        return CsvIssue(
            line, f"number is longer than {constants.PRINTED_NUMBER_MAX} characters"
        )
    if number in seen_numbers:
        return CsvIssue(
            line, f"number {number} is already on line {seen_numbers[number]}"
        )
    if len(barcode) > constants.BARCODE_MAX:
        return CsvIssue(
            line, f"barcode is longer than {constants.BARCODE_MAX} characters"
        )
    if barcode in seen_barcodes:
        return CsvIssue(line, f"barcode is already on line {seen_barcodes[barcode]}")
    return None
