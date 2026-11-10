/**
 * The state of one form submission, shared by every app that posts a form
 * (sign-ups, contact forms, studio actions). Lives in `@barrelsgd/ui` because
 * every consuming app already depends on it and the type is plain data with no
 * browser or server dependency, so it is safe in Client and Server code alike.
 *
 * `Success` and `Failure` add fields to the `success` and `error` states for
 * forms that need them (for example a failure kind or a next step). The status
 * names themselves never change, so `status === "error"` means the same thing
 * in every app.
 */
export type FormState<
  Success extends object = { message?: string },
  Failure extends object = { message: string },
> =
  | { status: "idle" }
  | { status: "submitting" }
  | ({ status: "success" } & Success)
  | ({ status: "error" } & Failure);
