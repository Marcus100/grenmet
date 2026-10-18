"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  isSignupResult,
  parseAlertEmail,
  SIGNUP_RESULTS,
} from "@/lib/alert-signup";
import { reportError } from "@/lib/report-error";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; message: string };

/** Outcome of the emailed confirm or unsubscribe link, from `?result=`. */
export function AlertSignupResult() {
  const result = useSearchParams().get("result");
  if (!isSignupResult(result)) {
    return null;
  }
  return (
    <p
      className="mb-6 rounded border-gm-border border-l-4 bg-gm-surface px-4 py-3 text-body-base text-gm-heading"
      role="status"
    >
      {SIGNUP_RESULTS[result]}
    </p>
  );
}

/**
 * Email sign-up for published weather alerts. FastAPI sends a confirmation
 * email (double opt-in) and answers the same for every address.
 */
export function AlertEmailSignup() {
  const [state, setState] = useState<FormState>({ status: "idle" });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("consent") !== "on") {
      setState({
        status: "error",
        message: "Please agree to receive weather alerts by email.",
      });
      return;
    }
    const parsed = parseAlertEmail({ email: String(data.get("email") ?? "") });
    if (!parsed.success) {
      setState({
        status: "error",
        message:
          parsed.error.issues[0]?.message ?? "Please enter a valid email.",
      });
      return;
    }
    setState({ status: "submitting" });
    try {
      const res = await fetch("/api/alerts/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: parsed.data.email }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setState({
          status: "error",
          message: body.error ?? "Something went wrong. Please try again.",
        });
        return;
      }
      form.reset();
      setState({ status: "success" });
    } catch (error) {
      reportError(error, "gms-alert-email-signup");
      setState({
        status: "error",
        message: "Could not reach the server. Please try again.",
      });
    }
  }

  if (state.status === "success") {
    return (
      <p
        className="rounded border-gm-border border-l-4 bg-gm-surface px-4 py-3 text-body-base text-gm-heading"
        role="status"
      >
        Check your email to confirm. We will only send alerts once you click the
        link.
      </p>
    );
  }

  return (
    <form className="max-w-xl space-y-4" noValidate onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="alert-email">Email address</Label>
        <Input
          autoComplete="email"
          id="alert-email"
          inputMode="email"
          name="email"
          required
          type="email"
        />
      </div>
      <label className="flex items-start gap-3 text-body-base">
        <input
          className="mt-1 size-5 shrink-0 accent-primary"
          name="consent"
          required
          type="checkbox"
        />
        <span>
          Email me when the Grenada Meteorological Service publishes, updates or
          cancels a weather alert. I can unsubscribe at any time.
        </span>
      </label>
      <Button disabled={state.status === "submitting"} type="submit">
        {state.status === "submitting" ? "Sending…" : "Email me alerts"}
      </Button>
      {state.status === "error" && (
        <p className="font-medium text-body-base text-destructive" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
