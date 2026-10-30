import { type AlertsResult, exerciseStatuses } from "@/lib/cap-alerts";

/**
 * Shown whenever any active CAP message carries a status other than `Actual`.
 *
 * During a drill — CARIBE WAVE, a national hurricane simulation — the warning
 * surfaces must say so unmistakably. A test message that reads as a live
 * warning is the single worst failure a warning site can have, so this is
 * deliberately loud and sits above the alerts themselves.
 */
export function ExerciseBanner({ result }: { result: AlertsResult }) {
  const statuses = exerciseStatuses(result);

  if (statuses.length === 0) {
    return null;
  }

  return (
    <div
      className="rounded-gm-card border-gm-risk-red bg-gm-risk-yellow mb-6 border-2 p-4 lg:p-5"
      role="alert"
    >
      <p className="text-gm-text-primary text-heading-sm leading-heading-sm font-bold uppercase">
        Exercise — this is a drill
      </p>
      <p className="text-body-base text-gm-text-primary leading-body-base mt-1">
        One or more messages below are marked{" "}
        <span className="font-bold">{statuses.join(" / ")}</span> and are part
        of a test, not a live warning. Take no protective action on the basis of
        these messages.
      </p>
    </div>
  );
}
