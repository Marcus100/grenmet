"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Turnstile } from "@barrelsgd/ui/components/ui/turnstile";
import { captureEvent } from "@barrelsgd/ui/lib/analytics-runtime";
import { useState } from "react";
import { env } from "@/lib/env";
import {
  NEWSLETTER_CONSENT,
  parseNewsletterSignup,
} from "@/lib/newsletter-signup";
import { reportError } from "@/lib/report-error";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; message: string };

/**
 * Sign-up for the daily climate newsletter. FastAPI sends a confirmation email
 * (double opt-in) and answers the same for every address, so the reply here
 * never says whether an address is already known.
 */
export function NewsletterSignup() {
  const [state, setState] = useState<FormState>({ status: "idle" });
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const parsed = parseNewsletterSignup({
      email: String(data.get("email") ?? ""),
      consent: data.get("consent") === "on",
      turnstileToken: turnstileToken ?? undefined,
    });
    if (!parsed.success) {
      setState({
        status: "error",
        message: parsed.error.issues[0]?.message ?? "Please check the form.",
      });
      return;
    }
    setState({ status: "submitting" });
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: parsed.data.email,
          consent: parsed.data.consent,
          turnstileToken: parsed.data.turnstileToken,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setState({
          status: "error",
          message: body.error ?? "Something went wrong. Please try again.",
        });
        setTurnstileReset((n) => n + 1);
        return;
      }
      form.reset();
      setTurnstileReset((n) => n + 1);
      captureEvent("newsletter_signup_submitted", {});
      setState({ status: "success" });
    } catch (error) {
      reportError(error, "gms-newsletter-signup");
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
        Check your email to confirm. Nothing is sent until you click the link.
      </p>
    );
  }

  return (
    <form className="max-w-xl space-y-4" noValidate onSubmit={handleSubmit}>
      <div className="space-y-2">
        <Label htmlFor="newsletter-email">Email address</Label>
        <Input
          autoComplete="email"
          id="newsletter-email"
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
        <span>{NEWSLETTER_CONSENT}</span>
      </label>
      <Turnstile
        onToken={setTurnstileToken}
        resetKey={turnstileReset}
        siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      />
      <Button disabled={state.status === "submitting"} type="submit">
        {state.status === "submitting" ? "Sending…" : "Email me the newsletter"}
      </Button>
      {state.status === "error" && (
        <p className="font-medium text-body-base text-destructive" role="alert">
          {state.message}
        </p>
      )}
    </form>
  );
}
