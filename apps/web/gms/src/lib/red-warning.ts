import { fetchPublicAlert } from "@/lib/cap";
import { type AlertsResult, severityLevel } from "@/lib/cap-alerts";

/**
 * When the earliest take-action (red) warning in effect was issued, in epoch
 * ms. The warning list omits issue times, so each red warning's CAP detail
 * supplies `sent`. Returns null when there is no red warning or when any of
 * them cannot be read: the desk then keeps every post behind "Earlier posts".
 */
export async function redWarningIssuedAt(
  result: AlertsResult
): Promise<number | null> {
  if (result.status !== "ok") return null;
  const identifiers = [
    ...new Set(
      result.groups
        .flatMap((group) => group.alerts)
        .filter(
          (alert) =>
            alert.status === "Actual" &&
            severityLevel(alert.severity) === "take-action"
        )
        .map((alert) => alert.identifier)
    ),
  ];
  if (identifiers.length === 0) return null;
  const details = await Promise.all(
    identifiers.map((identifier) => fetchPublicAlert(identifier))
  );
  const issued = details.map((detail) =>
    detail.status === "ok" ? Date.parse(detail.alert.sent) : Number.NaN
  );
  return issued.every(Number.isFinite) ? Math.min(...issued) : null;
}
