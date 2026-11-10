import { ClockIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The label on an observation or forecast that is no longer current: a clock
 * icon, the words, and a spoken "Warning:" so screen readers hear it too. The
 * grey is the CAP "expired" pair (`--gm-warning-grey-*`), a neutral signal, not
 * a hazard colour. Words carry the meaning; the colour only adds emphasis.
 *
 * `sky` sits on the home hero's gradient, where hazard colours may not go, so it
 * uses the scrim with inverse text instead.
 */
export function FreshnessNotice({
  message,
  tone = "light",
}: {
  message: string;
  tone?: "light" | "sky";
}) {
  return (
    <p
      className={cn(
        "text-body-sm leading-body-sm mt-2 flex items-start gap-2 rounded-lg px-3 py-2 font-semibold",
        tone === "sky"
          ? "bg-gm-scrim text-gm-text-inverse"
          : "bg-gm-warning-grey-bg text-gm-warning-grey-fg"
      )}
      role="status"
    >
      <ClockIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>
        <span className="sr-only">Warning: </span>
        {message}
      </span>
    </p>
  );
}
