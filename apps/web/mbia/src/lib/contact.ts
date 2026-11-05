import { contactMessageBodySchema } from "@barrelsgd/api-client";
import { z } from "zod";

export const CONTACT_SUBJECTS = [
  "General enquiry",
  "Flight information",
  "Business & commercial",
  "Lost & found",
  "Media",
] as const;

/** Public key of this site's contact form. FastAPI resolves its inbox and Turnstile policy from it. */
export const CONTACT_SITE_KEY = "mbia";

// Field limits come from the generated API schema, so they cannot drift from
// the API. The form adds the mbia subject list and its camelCase token name.
export const contactSchema = contactMessageBodySchema
  .omit({ turnstile_token: true })
  .extend({
    subject: z.enum(CONTACT_SUBJECTS),
    // Cloudflare Turnstile token; the route forwards it as `turnstile_token`.
    turnstileToken: z.string().max(2048).optional(),
  });

export type ContactInput = z.infer<typeof contactSchema>;

const FIELD_MESSAGES: Record<string, string> = {
  name: "Please enter your name",
  email: "Please enter a valid email address",
  subject: "Please choose a subject",
  message: "Please tell us a little more",
};

function trimStrings(input: unknown): unknown {
  if (typeof input !== "object" || input === null) {
    return input;
  }
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      typeof value === "string" ? value.trim() : value,
    ])
  );
}

/** Trims string fields, then validates. Use this for every incoming payload. */
export function parseContact(input: unknown) {
  return contactSchema.safeParse(trimStrings(input));
}

/** The first problem, worded for the visitor. */
export function firstContactError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return "Please check the form";
  }
  if (issue.code === "too_big") {
    return "That is too long. Please shorten it.";
  }
  return FIELD_MESSAGES[String(issue.path[0])] ?? "Please check the form";
}
