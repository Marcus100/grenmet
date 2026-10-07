"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

type Step = "email" | "code";

async function post(path: string, body: unknown): Promise<string | null> {
  const response = await fetch(path, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  if (response.ok) {
    return null;
  }
  const payload: unknown = await response.json().catch(() => null);
  const detail =
    typeof payload === "object" && payload !== null && "detail" in payload
      ? payload.detail
      : null;
  return typeof detail === "string" ? detail : "Something went wrong.";
}

export function SignInForm({ returnTo }: { returnTo: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const failure =
      step === "email"
        ? await post("/auth/email-code/start", { email })
        : await post("/auth/email-code/verify", { code, email });
    setPending(false);
    if (failure) {
      setError(failure);
      return;
    }
    if (step === "email") {
      setStep("code");
      return;
    }
    router.replace(returnTo);
    router.refresh();
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <label className="block space-y-1 text-body" htmlFor="sign-in-email">
        Email
        <Input
          autoComplete="email"
          disabled={step === "code"}
          id="sign-in-email"
          onChange={(event) => setEmail(event.target.value)}
          required
          type="email"
          value={email}
        />
      </label>
      {step === "code" ? (
        <label className="block space-y-1 text-body" htmlFor="sign-in-code">
          6-digit code we emailed you
          <Input
            autoComplete="one-time-code"
            id="sign-in-code"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setCode(event.target.value)}
            pattern="\d{6}"
            required
            value={code}
          />
        </label>
      ) : null}
      {error ? (
        <p className="text-body text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {step === "email" ? "Email me a code" : "Sign in"}
      </Button>
    </form>
  );
}
