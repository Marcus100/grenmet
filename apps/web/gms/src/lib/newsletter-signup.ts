import { z } from "zod";

/** FastAPI mailing list for the daily climate newsletter (07:30 Grenada time). */
export const NEWSLETTER_LIST_KEY = "gms-newsletter";

/** The reader's own words, shown beside the checkbox. Nothing else is implied. */
export const NEWSLETTER_CONSENT =
  "Email me the GMS climate newsletter once a day when it has news: weather alerts in effect, a short forecast and posts from the desk. I can unsubscribe at any time.";

export const newsletterSignupSchema = z.object({
  email: z.email("Please enter a valid email address."),
  consent: z.literal(true, {
    error: "Please agree to receive the newsletter by email.",
  }),
  turnstileToken: z.string().max(2048).optional(),
});

export function parseNewsletterSignup(input: unknown) {
  return newsletterSignupSchema.safeParse(input);
}
