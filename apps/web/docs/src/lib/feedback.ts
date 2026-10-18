import { z } from "zod";

/** Site key stored with every answer from this app. */
export const FEEDBACK_SITE = "docs";

export const feedbackSchema = z.object({
  // A path on this site: leading slash, no query string or fragment.
  pagePath: z
    .string()
    .max(300)
    .regex(/^\/[^?#\s]*$/, "Invalid page path."),
  helpful: z.boolean(),
  comment: z.string().trim().max(1000).optional(),
});

export type FeedbackInput = z.infer<typeof feedbackSchema>;
