import { z } from "zod";

/** Shown for network failures, server errors and unreadable responses. */
export const PDF_PREVIEW_FALLBACK =
  "Could not render the preview. Check your connection and retry the PDF preview.";

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
