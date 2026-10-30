import Link from "next/link";
import type { StudioFailure } from "@/lib/studio-errors";

/** A failed read: what happened and the next step, announced as an alert. */
export function StudioAlert({
  failure,
  backHref,
  backLabel,
}: {
  failure: StudioFailure;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div
      className="border-destructive/40 bg-destructive/10 space-y-2 rounded-lg border p-4"
      role="alert"
    >
      <p className="font-semibold">{failure.message}</p>
      <p className="text-muted-foreground">{failure.nextStep}</p>
      {backHref ? (
        <Link
          className="text-primary inline-flex min-h-11 items-center font-medium underline underline-offset-4"
          href={{ pathname: backHref }}
        >
          {backLabel ?? "Go back"}
        </Link>
      ) : null}
    </div>
  );
}

/** Shown by `loading.tsx`: a polite status line, never a spinner alone. */
export function StudioLoading({ children }: { children: string }) {
  return (
    <p className="text-muted-foreground" role="status">
      {children}
    </p>
  );
}
