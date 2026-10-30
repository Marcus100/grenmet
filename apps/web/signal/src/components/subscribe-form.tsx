"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Turnstile } from "@barrelsgd/ui/components/ui/turnstile";
import { useState } from "react";
import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";
import { parseSubscription } from "@/lib/subscribe";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; message: string };

/**
 * Newsletter sign-up: email plus consent. FastAPI sends a confirmation email
 * (double opt-in) and answers the same for every address.
 */
export function SubscribeForm() {
  const [state, setState] = useState<FormState>({ status: "idle" });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    if (data.get("consent") !== "on") {
      setState({
        status: "error",
        message: "Please agree to receive the newsletter.",
      });
      return;
    }
    const parsed = parseSubscription({
      email: String(data.get("email") ?? ""),
    });
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
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: parsed.data.email,
          turnstileToken: turnstileToken ?? undefined,
        }),
      });
      if (!res.ok) {
        setTurnstileReset((n) => n + 1);
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
      reportError(error, "signal-subscribe");
      setState({
        status: "error",
        message: "Could not reach the server. Please try again.",
      });
    }
  }

  if (state.status === "success") {
    return (
      <p className="text-lg font-medium" role="status">
        Check your email to confirm. We will only send the newsletter once you
        click the link.
      </p>
    );
  }

  return (
    <form className="max-w-xl space-y-4" noValidate onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label className="text-base" htmlFor="subscribe-email">
          Email address
        </Label>
        <Input
          autoComplete="email"
          className="h-11 text-base"
          id="subscribe-email"
          inputMode="email"
          name="email"
          required
          type="email"
        />
      </div>
      <label className="flex items-start gap-3 text-base leading-relaxed">
        <input
          className="accent-primary mt-1 size-5 shrink-0"
          name="consent"
          required
          type="checkbox"
        />
        <span>
          Send me the Grenada Signal newsletter by email. I can unsubscribe at
          any time.
        </span>
      </label>
      <Turnstile
        onToken={setTurnstileToken}
        resetKey={turnstileReset}
        siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      />
      <Button
        className="h-11 px-5 text-base"
        disabled={state.status === "submitting"}
        type="submit"
      >
        {state.status === "submitting" ? "Sending…" : "Subscribe"}
      </Button>
      {state.status === "error" && (
        <p className="text-destructive text-base font-medium" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
