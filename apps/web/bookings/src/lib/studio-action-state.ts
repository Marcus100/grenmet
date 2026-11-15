// What a booking action hands back to the form that ran it (useActionState).
// Plain data, safe to import from Client Components. The status names are the
// shared `FormState` from @barrelsgd/ui; this file only adds the studio fields.

import type { FormState } from "@barrelsgd/ui/lib/form-state";
import type { ContactFieldErrors } from "@/lib/business-contact";
import type { StudioFailureKind } from "@/lib/studio-errors";

export type ActionState = FormState<
  { message: string; warning?: boolean },
  { kind: StudioFailureKind; message: string; nextStep: string }
>;

/** The business profile form's state: adds per-field contact option messages. */
export type ProfileState = FormState<
  { message: string; warning?: boolean },
  {
    kind: StudioFailureKind;
    message: string;
    nextStep: string;
    fields?: ContactFieldErrors;
  }
>;

export const IDLE: ActionState = { status: "idle" };
