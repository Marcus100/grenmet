import { z } from "zod";

/** FastAPI mailing list and push list that carry published CAP alerts. */
export const ALERTS_LIST_KEY = "gms-alerts";

export const alertEmailSchema = z.object({
  email: z.email("Please enter a valid email address."),
});

export function parseAlertEmail(input: unknown) {
  return alertEmailSchema.safeParse(input);
}

const base64Url = z.string().min(8).max(255);

/** The parts of a browser PushSubscription that the server stores. */
export const pushSubscriptionSchema = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({ p256dh: base64Url, auth: base64Url }),
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.url().max(2048),
});

/** Result of following the emailed confirm or unsubscribe link. */
export const SIGNUP_RESULTS = {
  confirmed: "You are subscribed to GMS weather alert emails.",
  unsubscribed: "You are unsubscribed from GMS weather alert emails.",
  invalid:
    "That link is not valid. It may have expired or already been used. You can sign up again below.",
} as const;

export type SignupResult = keyof typeof SIGNUP_RESULTS;

export function isSignupResult(value: string | null): value is SignupResult {
  return value !== null && value in SIGNUP_RESULTS;
}
