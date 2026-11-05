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
// Not exported: it does not trim. Use parseContact, which trims first.
const contactSchema = contactMessageBodySchema
  .omit({ turnstile_token: true })
  .extend({
    subject: z.enum(CONTACT_SUBJECTS),
    // Cloudflare Turnstile token; the route forwards it as `turnstile_token`.
    turnstileToken: z.string().max(2048).optional(),
  });

export type ContactInput = z.infer<typeof contactSchema>;

const LABELS: Record<string, string> = {
  name: "Name",
  email: "Email",
  subject: "Subject",
  message: "Message",
};

const FIELD_PROBLEMS: Record<string, string> = {
  name: "Name: please enter at least 2 characters.",
  email: "Email: please enter a valid email address.",
  subject: "Subject: please choose one of the options.",
  message: "Message: please write at least 10 characters.",
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

/** The first problem, naming the field the visitor must fix. */
export function firstContactError(error: z.ZodError): string {
  const issue = error.issues[0];
  if (!issue) {
    return "Please check the form.";
  }
  const field = String(issue.path[0]);
  if (issue.code === "too_big") {
    return `${LABELS[field] ?? "This field"} is too long. Please shorten it.`;
  }
  return FIELD_PROBLEMS[field] ?? "Please check the form.";
}
