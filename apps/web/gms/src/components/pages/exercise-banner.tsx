import { type AlertsResult, exerciseStatuses } from "@/lib/cap";

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
      className="mb-6 rounded border-2 border-gm-risk-red bg-gm-risk-yellow p-4 lg:p-5"
      role="alert"
    >
      <p className="font-bold text-gm-text-primary text-heading-sm uppercase leading-heading-sm">
        Exercise — this is a drill
      </p>
      <p className="mt-1 text-body-base text-gm-text-primary leading-body-base">
        One or more messages below are marked{" "}
        <span className="font-bold">{statuses.join(" / ")}</span> and are part
        of a test, not a live warning. Take no protective action on the basis of
        these messages.
      </p>
    </div>
  );
}
