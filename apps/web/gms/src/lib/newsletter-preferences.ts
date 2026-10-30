import { z } from "zod";

/**
 * Preferences for the lists behind one emailed link. The token is the signed
 * value from the mail; FastAPI decides what it identifies and answers the same
 * refusal for every bad token.
 */

/** A mailing list key as FastAPI accepts it (lower-case words and hyphens). */
const listKeySchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9-]+$/u);

export const preferencesUnsubscribeSchema = z.object({
  token: z.string().min(1).max(2048),
  listKey: listKeySchema,
});

export function parsePreferencesUnsubscribe(input: unknown) {
  return preferencesUnsubscribeSchema.safeParse(input);
}

/** One list the reader is still subscribed to, as shown on the page. */
export interface SubscribedListView {
  listKey: string;
  listName: string;
}

export const PREFERENCES_INVALID_MESSAGE =
  "This link is not valid. It may have expired or already been used. Use the link in your most recent newsletter email, or sign up again.";

export const PREFERENCES_UNAVAILABLE_MESSAGE =
  "Your subscriptions cannot be shown right now. Please try again later, or use the unsubscribe link in your most recent email.";
