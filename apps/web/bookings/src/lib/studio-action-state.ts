// What a booking action hands back to the form that ran it (useActionState).
// Plain data, safe to import from Client Components.

import type { StudioFailureKind } from "@/lib/studio-errors";

export type ActionState =
  | { status: "idle" }
  | { status: "done"; message: string; warning?: boolean }
  | {
      status: "error";
      kind: StudioFailureKind;
      message: string;
      nextStep: string;
    };

export const IDLE: ActionState = { status: "idle" };
