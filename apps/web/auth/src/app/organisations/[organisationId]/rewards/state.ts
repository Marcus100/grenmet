/** Outcome of one rewards admin form, shown next to the form that sent it. */
export interface FormState {
  readonly message: string;
  readonly status: "idle" | "ok" | "error";
}

export const IDLE: FormState = { message: "", status: "idle" };

/** Server action shape for `useActionState`. */
export type FormAction = (
  previous: FormState,
  formData: FormData
) => Promise<FormState>;
