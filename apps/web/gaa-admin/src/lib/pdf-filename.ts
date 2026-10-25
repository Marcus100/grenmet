import { PRODUCT_KINDS, type ProductKind } from "@barrelsgd/gms/products";

/**
 * Human download names for PDFs saved from the browser. They mirror the names
 * FastAPI sends in `Content-Disposition` (src/utils/filenames.py): readable
 * title, Grenada-local date, revision, never a database ID.
 */

const FORBIDDEN = /[\\/:*?"<>|]+/g;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const SPACES = /\s+/g;
const EDGE = /^[ .]+|[ .]+$/g;
const MAX_STEM = 120;
const TRAILING = /[ .-]+$/;

const ISSUE_HOURS: Partial<Record<ProductKind, string>> = {
  morning: "0700",
  midday: "1200",
  evening: "1800",
};

const BULLETIN_TITLES: Partial<Record<ProductKind, string>> = {
  cyclone: "Tropical Cyclone Bulletin",
  marine: "Marine Bulletin",
  flood: "Flood Bulletin",
  thunderstorm: "Thunderstorm Bulletin",
  wind: "Wind Bulletin",
  heat: "Heat Bulletin",
  dust: "Dust and Haze Bulletin",
  coastal: "Coastal Hazard Bulletin",
  tsunami: "Tsunami Bulletin",
};

export const HR_FORM_TITLES = {
  absentee_report: "Absentee Report",
  leave_request: "Leave Application",
  parking_permit: "Parking Access Application",
  shift_swap: "Shift Exchange",
  status_report: "Daily Status Report",
  timesheet: "Timesheet",
} as const;

export type HrFormTitleKey = keyof typeof HR_FORM_TITLES;

function cleanPart(text: string) {
  const printable = [...text]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("");
  return printable
    .replace(FORBIDDEN, " ")
    .replace(SPACES, " ")
    .replace(EDGE, "");
}

export function pdfFilename(parts: string[], note?: string) {
  const joined = parts
    .map(cleanPart)
    .filter(Boolean)
    .join(" - ")
    .slice(0, MAX_STEM)
    .replace(TRAILING, "");
  const stem = joined || "Document";
  const cleanNote = note ? cleanPart(note) : "";
  return `${stem}${cleanNote ? ` (${cleanNote})` : ""}.pdf`;
}

/** `YYYY-MM-DD` for a moment, read on the Grenada calendar (UTC-4, no DST). */
export function grenadaDate(moment: Date | string = new Date()) {
  const date = typeof moment === "string" ? new Date(moment) : moment;
  if (Number.isNaN(date.getTime())) return grenadaDate(new Date());
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Grenada",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Saved revision (`revision` set) or unsaved preview of a weather product. */
export function productPdfFilename(
  kind: ProductKind,
  values: Record<string, string>,
  revision?: number
) {
  const title = BULLETIN_TITLES[kind] ?? PRODUCT_KINDS[kind];
  const issued = values.issuedAt?.slice(0, 10) ?? "";
  const day = ISO_DAY.test(issued) ? issued : grenadaDate();
  return pdfFilename(
    [`GMS ${title} ${day} ${ISSUE_HOURS[kind] ?? ""}`],
    revision === undefined ? "draft preview" : `rev ${revision}`
  );
}

/** Signed copy: the signer's name is already printed on the document. */
export function signedDocumentFilename(
  entity: string,
  signerName: string,
  signedAt: string,
  revision = 1
) {
  const title =
    HR_FORM_TITLES[entity as HrFormTitleKey] ?? "Signed HR Document";
  return pdfFilename(
    [title, signerName, grenadaDate(signedAt)],
    revision > 1 ? `rev ${revision}` : undefined
  );
}

/**
 * Download name for a form's own PDF: a draft is labelled "Preview"; once the
 * form is signed the file is the real document. No person's name; Grenada date.
 */
export function hrFormFilename(entity: HrFormTitleKey, signed = false) {
  const title = HR_FORM_TITLES[entity];
  return pdfFilename([signed ? title : `${title} Preview`, grenadaDate()]);
}
