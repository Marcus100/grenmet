// What a booking action hands back to the form that ran it (useActionState).
// Plain data, safe to import from Client Components. The status names are the
// shared `FormState` from @barrelsgd/ui; this file only adds the studio fields.

import type { FormState } from "@barrelsgd/ui/lib/form-state";
import type { StudioFailureKind } from "@/lib/studio-errors";

export type ActionState = FormState<
  { message: string; warning?: boolean },
  { kind: StudioFailureKind; message: string; nextStep: string }
>;

export const IDLE: ActionState = { status: "idle" };
