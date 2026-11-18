import { z } from "zod";

/** Shown only when the request never got an answer (network failure or timeout). */
export const PDF_PREVIEW_FALLBACK =
  "Could not render the preview. Check your connection and retry the PDF preview.";

/** Shown when the server answered but could not render the PDF. */
export function pdfPreviewServerError(status: number): string {
  return `The server could not render the PDF (error ${status}). Try again in a minute; if it keeps happening, tell the Barrels team.`;
}

/** Shown when the server's answer is not in the shape this page expects. */
export const ANSWER_PROBLEM =
  "The server's answer was not in the expected format. Try again; if it keeps happening, tell the Barrels team.";

const apiDetail = z.object({ detail: z.string().trim().min(1) });

/**
 * The API's own message for a refused preview: a 4xx response whose body
 * carries `detail` (FastAPI's AuthoringError and validation messages). Returns
 * null for every other failure, which keeps the generic fallback.
 */
export function pdfPreviewRefusal(
  status: number,
  body: unknown
): string | null {
  if (status < 400 || status > 499) return null;
  const parsed = apiDetail.safeParse(body);
  return parsed.success ? parsed.data.detail : null;
}
