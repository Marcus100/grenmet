"use client";

// The one interactive part of the Plan & billing page: starts the hosted Checkout
// (or resumes an open one). The server action redirects to Stripe on success, so
// this form only shows a refusal. The button is navy (the page's one primary
// action) and 44 px tall. Results are announced: role="alert" for a refusal.

import { Button } from "@barrelsgd/ui/components/ui/button";
import { useActionState } from "react";
import { startSubscriptionAction } from "@/app/studio/[orgSlug]/plan/actions";
import { type ActionState, IDLE } from "@/lib/studio-action-state";

export interface StartSubscriptionButtonProps {
  label: "Start subscription" | "Continue checkout";
  orgSlug: string;
}

export function StartSubscriptionButton({
  label,
  orgSlug,
}: StartSubscriptionButtonProps) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    startSubscriptionAction,
    IDLE
  );

  return (
    <form action={formAction} className="space-y-3">
      <input name="orgSlug" type="hidden" value={orgSlug} />
      <Button
        className="min-h-11 w-full sm:w-auto"
        disabled={pending}
        type="submit"
      >
        {pending ? "Opening checkout" : label}
      </Button>
      {pending ? (
        <p className="text-muted-foreground text-sm" role="status">
          Opening the secure checkout page.
        </p>
      ) : null}
      {state.status === "error" ? (
        <div
          className="border-destructive/40 bg-destructive/10 space-y-1 rounded-lg border p-3"
          role="alert"
        >
          <p className="font-semibold">{state.message}</p>
          <p className="text-muted-foreground">{state.nextStep}</p>
        </div>
      ) : null}
    </form>
  );
}
