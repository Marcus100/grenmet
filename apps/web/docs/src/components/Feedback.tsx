"use client";

import { Turnstile } from "@barrelsgd/ui/components/ui/turnstile";
import { cn } from "@barrelsgd/ui/lib/utils";
import { usePathname } from "next/navigation";
import { forwardRef, useState } from "react";
import { env } from "@/lib/env";
import { reportError } from "@/lib/report-error";

function CheckIcon(props: React.ComponentPropsWithoutRef<"svg">) {
  return (
    <svg aria-hidden="true" viewBox="0 0 20 20" {...props}>
      <circle cx="10" cy="10" r="10" strokeWidth="0" />
      <path
        d="m6.75 10.813 2.438 2.437c1.218-4.469 4.062-6.5 4.062-6.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function FeedbackButton(
  props: Omit<React.ComponentPropsWithoutRef<"button">, "type" | "className">
) {
  return (
    <button
      className="px-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-900/2.5 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-white"
      type="submit"
      {...props}
    />
  );
}

const FeedbackForm = forwardRef<
  React.ElementRef<"form">,
  React.ComponentPropsWithoutRef<"form">
>(function FeedbackForm({ onSubmit, className, ...props }, ref) {
  return (
    <form
      {...props}
      className={cn(
        className,
        "absolute inset-0 flex items-center justify-center gap-6 md:justify-start"
      )}
      onSubmit={onSubmit}
      ref={ref}
    >
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Was this page helpful?
      </p>
      <div className="group grid h-8 grid-cols-[1fr_1px_1fr] overflow-hidden rounded-full border border-zinc-900/10 dark:border-white/10">
        <FeedbackButton data-response="yes">Yes</FeedbackButton>
        <div className="bg-zinc-900/10 dark:bg-white/10" />
        <FeedbackButton data-response="no">No</FeedbackButton>
      </div>
    </form>
  );
});

const FeedbackThanks = forwardRef<
  React.ElementRef<"div">,
  React.ComponentPropsWithoutRef<"div">
>(function FeedbackThanks({ className, ...props }, ref) {
  return (
    <div
      {...props}
      className={cn(
        className,
        "absolute inset-0 flex justify-center md:justify-start"
      )}
      ref={ref}
    >
      <div className="bg-gm-blue/5 text-gm-navy ring-gm-blue/20 dark:bg-gm-blue-ink/5 dark:text-gm-sky dark:ring-gm-sky/30 flex items-center gap-3 rounded-full py-1 pr-3 pl-1.5 text-sm ring-1 ring-inset">
        <CheckIcon className="fill-gm-blue dark:fill-gm-sky/20 dark:stroke-gm-sky h-5 w-5 flex-none stroke-white" />
        Thanks for your feedback!
      </div>
    </div>
  );
});

export function Feedback() {
  const pathname = usePathname();
  const [submitted, setSubmitted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileReset, setTurnstileReset] = useState(0);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const response = submitter?.getAttribute("data-response");
    if (response !== "yes" && response !== "no") {
      return;
    }
    setFailed(false);
    try {
      const result = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pagePath: pathname,
          helpful: response === "yes",
          turnstileToken: turnstileToken ?? undefined,
        }),
      });
      if (!result.ok) {
        setTurnstileReset((n) => n + 1);
        setFailed(true);
        return;
      }
      setSubmitted(true);
    } catch (error) {
      reportError(error, "docs-feedback");
      setTurnstileReset((n) => n + 1);
      setFailed(true);
    }
  }

  return (
    <div className="relative h-8">
      <FeedbackForm
        className={cn(
          "transition-opacity duration-300",
          submitted && "pointer-events-none opacity-0"
        )}
        inert={submitted}
        onSubmit={onSubmit}
      />
      {failed && (
        <p
          className="absolute inset-x-0 top-9 text-center text-sm text-red-700 md:text-left dark:text-red-400"
          role="alert"
        >
          We could not save your feedback. Please try again.
        </p>
      )}
      <Turnstile
        onToken={setTurnstileToken}
        resetKey={turnstileReset}
        siteKey={env.NEXT_PUBLIC_TURNSTILE_SITE_KEY}
      />
      {submitted && (
        <FeedbackThanks className="transition-opacity delay-150 duration-300 starting:opacity-0" />
      )}
    </div>
  );
}
