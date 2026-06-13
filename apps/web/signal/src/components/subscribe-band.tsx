"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import { Input } from "@grenmet/ui/components/ui/input";
import { cn } from "@grenmet/ui/lib/utils";
import { type FormEvent, useId, useState } from "react";

type Status = "idle" | "loading" | "success" | "error";

export function SubscribeBand({
  id,
  className,
}: {
  id?: string;
  className?: string;
}) {
  const emailId = useId();
  const whatsappId = useId();
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("loading");
    setError(null);

    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, whatsapp: whatsapp || undefined }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(
          data?.error ?? "Something went wrong. Please try again."
        );
      }

      setStatus("success");
    } catch (err) {
      setStatus("error");
      setError(
        err instanceof Error ? err.message : "Something went wrong. Try again."
      );
    }
  }

  return (
    <section className={cn("bg-signal-green text-white", className)} id={id}>
      <div className="mx-auto w-full max-w-2xl px-4 py-10">
        <h2 className="font-bold font-serif text-2xl sm:text-3xl">
          Know what going on. In 5 minutes.
        </h2>
        <p className="mt-2 text-sm text-white/85">
          Grenada Signal delivers the day's essentials — news, weather,
          opportunities, and what to watch — every morning.
        </p>

        {status === "success" ? (
          <p
            className="mt-5 rounded-md bg-white/15 px-4 py-3 font-medium text-sm"
            role="status"
          >
            You in. Look out for your first Signal soon.
          </p>
        ) : (
          <form className="mt-5 flex flex-col gap-3" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                aria-label="Email address"
                autoComplete="email"
                className="flex-1 bg-white text-signal-ink"
                id={emailId}
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="Email address"
                required
                type="email"
                value={email}
              />
              <Button
                className="bg-signal-ink text-white hover:bg-black"
                disabled={status === "loading"}
                type="submit"
              >
                {status === "loading" ? "Joining…" : "Subscribe"}
              </Button>
            </div>
            <Input
              aria-label="WhatsApp number (optional)"
              autoComplete="tel"
              className="bg-white text-signal-ink"
              id={whatsappId}
              name="whatsapp"
              onChange={(event) => setWhatsapp(event.target.value)}
              placeholder="WhatsApp number (optional)"
              type="tel"
              value={whatsapp}
            />
            {status === "error" && error ? (
              <p className="text-sm text-white" role="alert">
                {error}
              </p>
            ) : null}
            <p className="text-white/70 text-xs">
              By subscribing, you agree to our Terms &amp; Privacy Policy.
            </p>
          </form>
        )}
      </div>
    </section>
  );
}
