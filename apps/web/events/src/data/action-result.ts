/** The outcome of a server action. Safe to import from client components. */
export type ActionResult<T = undefined> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly error: string;
      readonly ok: false;
      /** The server confirmed the attempt is over (card payment unavailable, or the
       * attempt expired): drop its idempotency key. Never set for a bare 5xx. */
      readonly freshKey?: true;
    };

/** Returned when a write needs a signed-in member; the UI sends them to sign in. */
export const SIGN_IN_REQUIRED = "sign-in-required";
