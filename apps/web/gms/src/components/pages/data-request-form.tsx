"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@barrelsgd/ui/components/ui/native-select";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { Turnstile } from "@barrelsgd/ui/components/ui/turnstile";
import { useRef, useState } from "react";
import {
  DATA_FORMATS,
  DATA_PARAMETERS,
  dataRequestSchema,
  INTENDED_USES,
} from "@/lib/data-request";
import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";

type FormState =
  | { status: "idle" }
  | { status: "submitting" }
  | { status: "success" }
  | { status: "error"; message: string };

function readForm(form: HTMLFormElement) {
  const data = new FormData(form);
  const text = (key: string) => String(data.get(key) ?? "");
  return {
    name: text("name"),
    email: text("email"),
    organisation: text("organisation"),
    purpose: text("purpose"),
    parameters: data.getAll("parameters").map(String),
    stations: text("stations"),
    periodStart: text("periodStart"),
    periodEnd: text("periodEnd"),
    dataFormat: text("dataFormat"),
    intendedUse: text("intendedUse"),
    consent: data.get("consent") === "on",
    website: text("website"),
  };
}

export function DataRequestForm() {
  const [state, setState] = useState<FormState>({ status: "idle" });
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  function fail(message: string) {
    setState({ status: "error", message });
    // Move focus to the message so screen-reader and keyboard users land on it.
    requestAnimationFrame(() => errorRef.current?.focus());
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = dataRequestSchema.safeParse(readForm(form));
    if (!parsed.success) {
      fail(parsed.error.issues[0]?.message ?? "Please check the form.");
      return;
    }
    setState({ status: "submitting" });
    try {
      const res = await fetch("/api/data-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...parsed.data,
          turnstileToken: turnstileToken ?? undefined,
        }),
      });
      if (!res.ok) {
        setTurnstileReset((n) => n + 1);
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        fail(body.error ?? "Something went wrong. Please try again.");
        return;
      }
      form.reset();
      setState({ status: "success" });
    } catch (error) {
      reportError(error, "gms-data-request");
      fail("Could not reach the server. Please try again.");
    }
  }

  if (state.status === "success") {
    return (
      <p
        className="rounded border-gm-border border-l-4 bg-gm-surface px-4 py-3 text-body-base text-gm-heading"
        role="status"
      >
        Thank you. We have received your request and sent a confirmation to your
        email address. We will reply by email.
      </p>
    );
  }

  return (
    <form
      aria-describedby={
        state.status === "error" ? "data-request-error" : undefined
      }
      className="max-w-2xl space-y-5"
      noValidate
      onSubmit={handleSubmit}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dr-name">Name</Label>
          <Input
            autoComplete="name"
            id="dr-name"
            name="name"
            required
            type="text"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dr-email">Email</Label>
          <Input
            autoComplete="email"
            id="dr-email"
            inputMode="email"
            name="email"
            required
            type="email"
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dr-organisation">Organisation</Label>
        <Input
          autoComplete="organization"
          id="dr-organisation"
          name="organisation"
          required
          type="text"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dr-intended-use">Intended use</Label>
        <NativeSelect
          className="w-full"
          id="dr-intended-use"
          name="intendedUse"
          required
        >
          {INTENDED_USES.map((use) => (
            <NativeSelectOption key={use.value} value={use.value}>
              {use.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dr-purpose">Purpose of the request</Label>
        <Textarea
          aria-describedby="dr-purpose-hint"
          id="dr-purpose"
          maxLength={2000}
          name="purpose"
          required
          rows={4}
        />
        <p className="text-body-sm text-gm-text-secondary" id="dr-purpose-hint">
          What the data is for. This helps us supply the most suitable series.
        </p>
      </div>
      <fieldset className="space-y-2">
        <legend className="font-medium text-sm">Elements needed</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {DATA_PARAMETERS.map((item) => (
            <label
              className="flex min-h-11 items-center gap-3 text-body-base"
              key={item.value}
            >
              <input
                className="size-5 accent-primary"
                name="parameters"
                type="checkbox"
                value={item.value}
              />
              {item.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="space-y-2">
        <Label htmlFor="dr-stations">Stations or area</Label>
        <Input
          aria-describedby="dr-stations-hint"
          id="dr-stations"
          name="stations"
          required
          type="text"
        />
        <p
          className="text-body-sm text-gm-text-secondary"
          id="dr-stations-hint"
        >
          Name the station or area, and say if a nearby station would do.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="dr-period-start">Period start</Label>
          <Input id="dr-period-start" name="periodStart" required type="date" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dr-period-end">Period end</Label>
          <Input id="dr-period-end" name="periodEnd" required type="date" />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="dr-format">Format</Label>
        <NativeSelect
          className="w-full"
          id="dr-format"
          name="dataFormat"
          required
        >
          {DATA_FORMATS.map((format) => (
            <NativeSelectOption key={format.value} value={format.value}>
              {format.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {/* Honeypot: hidden from people and assistive technology. */}
      <div aria-hidden="true" className="absolute -left-[9999px]">
        <label htmlFor="dr-website">Leave this field empty</label>
        <input
          autoComplete="off"
          id="dr-website"
          name="website"
          tabIndex={-1}
          type="text"
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
          I agree to the conditions of use above, to acknowledge the Grenada
          Meteorological Service in any publication, and to being contacted by
          email about this request.
        </span>
      </label>
      <Turnstile
        onToken={setTurnstileToken}
        resetKey={turnstileReset}
        siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      />
      <Button disabled={state.status === "submitting"} type="submit">
        {state.status === "submitting" ? "Sending…" : "Send request"}
      </Button>
      {state.status === "error" && (
        <p
          className="font-medium text-body-base text-destructive"
          id="data-request-error"
          ref={errorRef}
          role="alert"
          tabIndex={-1}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
