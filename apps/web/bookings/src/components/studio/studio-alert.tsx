import Link from "next/link";
import { CARD, CARD_LINK } from "@/components/studio/studio-ui";
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
      className={`${CARD} border-destructive/40 space-y-2 border`}
      role="alert"
    >
      <p className="font-semibold">{failure.message}</p>
      <p className="text-foreground/80">{failure.nextStep}</p>
      {backHref ? (
        <Link className={CARD_LINK} href={{ pathname: backHref }}>
          {backLabel ?? "Go back"}
        </Link>
      ) : null}
    </div>
  );
}

/** Shown by `loading.tsx`: a polite status line, never a spinner alone. */
export function StudioLoading({ children }: { children: string }) {
  return (
    <p className={`${CARD} text-foreground`} role="status">
      {children}
    </p>
  );
}
