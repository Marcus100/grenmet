import { capAlertImportRequestSchema } from "@barrelsgd/api-client";
import { z } from "zod";

// Client-safe: the import form validates with this before posting.

/** The API's import cap (validation.py MAX_IMPORT_BYTES): 5 MiB of UTF-8. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

const TOO_LARGE =
  "The document is larger than 5 MB, which is more than CAP imports accept. Remove what is not needed or import a smaller file.";

/**
 * What the import form may send. The reviewed flag is checked here as well as
 * in the browser: the API never sees an import the forecaster did not confirm.
 */
export const importInputSchema = z.object({
  reviewed: z.literal(true, {
    message: "Tick the confirmation that you checked the source.",
  }),
  source: capAlertImportRequestSchema.shape.source,
  value: z
    .string()
    .trim()
    .min(1, { message: "Paste the CAP XML or the public https address." })
    .refine(
      (text) => new TextEncoder().encode(text).length <= MAX_IMPORT_BYTES,
      {
        message: TOO_LARGE,
      }
    ),
});

export type ImportInput = z.infer<typeof importInputSchema>;
