import type { ReactNode } from "react";
import { errorBoxClass } from "@/components/form-styles";
import {
  classifyFailure,
  FAILURE_TEXT,
  type FailureKind,
} from "@/lib/org-rewards-errors";
import { reportError } from "@/lib/report-error";

/** Shared pieces for the rewards admin sections: loading, empty, failed. */

export function SectionSkeleton({ title }: { readonly title: string }) {
  return (
    <output aria-live="polite" className="block space-y-3 py-2">
      <span className="sr-only">Loading {title}…</span>
      <div className="bg-muted h-4 w-1/4 animate-pulse rounded" />
      <div className="bg-muted h-16 animate-pulse rounded" />
    </output>
  );
}

export function EmptyNote({ children }: { readonly children: ReactNode }) {
  return <p className="text-muted-foreground py-5 text-sm">{children}</p>;
}

/** A form with its own heading, set apart from the list above it. */
export function FormPanel({
  children,
  intro,
  title,
}: {
  readonly children: ReactNode;
  readonly intro?: string;
  readonly title: string;
}) {
  return (
    <div className="border-border space-y-3 rounded-xl border p-4 sm:p-5">
      <h3 className="text-foreground text-sm font-medium">{title}</h3>
      {intro ? <p className="text-muted-foreground text-sm">{intro}</p> : null}
      {children}
    </div>
  );
}

interface FailureOptions {
  /** Wording for a 404 (a feature that is not switched on yet). */
  readonly notFound?: string;
}

/**
 * The fallback for a section whose data could not be loaded. The failure is
 * reported (4xx are filtered out by `reportError`), never thrown, so one broken
 * section doesn't take the page down.
 */
export function SectionFailure({
  area,
  error,
  options,
}: {
  readonly area: string;
  readonly error: unknown;
  readonly options?: FailureOptions;
}) {
  reportError(error, area);
  const kind: FailureKind = classifyFailure(error);
  const text =
    kind === "not-found" && options?.notFound
      ? options.notFound
      : FAILURE_TEXT[kind];
  const informative = kind === "not-found" && options?.notFound;
  return (
    <p
      className={
        informative ? "text-foreground py-5 text-sm" : `${errorBoxClass} my-5`
      }
      role={informative ? "status" : "alert"}
    >
      {text}
    </p>
  );
}

export function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/Grenada",
  });
}
