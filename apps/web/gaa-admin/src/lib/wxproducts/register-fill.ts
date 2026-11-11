import type { PublicCurrentConditions } from "@barrelsgd/api-client";
import type { ProductField, ProductValues } from "@barrelsgd/gms/products";

/**
 * Fill the midday forecast's observed temperature from the eRegister (issue
 * #1197, section E). Pure: the desk fetches the latest public MBIA observation
 * and applies the patch to empty fields only. The value must come from that
 * day's 12:00 Grenada observation; anything else is reported, never guessed.
 */

/** Shown after a successful fill. */
export const REGISTER_HINT =
  "Filled from the accepted 12:00 observation at MBIA";

/** MBIA, the station the midday forecast quotes. */
const MBIA_STATION = "78958";
/** Grenada keeps UTC−04:00 all year, so local 12:00 is 16:00 UTC. */
const MIDDAY_UTC_HOUR = 16;

type Observation = NonNullable<PublicCurrentConditions["observation"]>;

export interface RegisterFill {
  notes: string[];
  patch: ProductValues;
}

function grenadaTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Grenada",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}

/** Whether `observedAt` is 12:00 Grenada time on `isoDate` (YYYY-MM-DD). */
export function isMiddayObservation(observedAt: string, isoDate: string) {
  const time = new Date(observedAt);
  if (Number.isNaN(time.getTime())) return false;
  return (
    time.toISOString().slice(0, 10) === isoDate &&
    time.getUTCHours() === MIDDAY_UTC_HOUR &&
    time.getUTCMinutes() === 0
  );
}

export function registerFill({
  date,
  fields,
  observation,
}: {
  /** The forecast's issue date, Grenada (YYYY-MM-DD). */
  date: string;
  /** This section's `fillFrom: "register"` fields. */
  fields: readonly ProductField[];
  observation: Observation | null | undefined;
}): RegisterFill {
  if (!observation)
    return {
      patch: {},
      notes: ["No accepted observation is in the register yet."],
    };
  if (observation.station_id !== MBIA_STATION)
    return {
      patch: {},
      notes: [
        `The latest observation is from station ${observation.station_id}, not MBIA.`,
      ],
    };
  if (!isMiddayObservation(observation.observed_at, date))
    return {
      patch: {},
      notes: [
        `The latest accepted observation is from ${grenadaTime(observation.observed_at)}, not 12:00 on this day. Type the midday temperature, or accept the 12:00 observation first.`,
      ],
    };
  // The public route also returns readings still awaiting QC ("provisional");
  // a public forecast quotes only an accepted observation.
  if (observation.status !== "accepted")
    return {
      patch: {},
      notes: [
        "The 12:00 observation is not accepted yet. Accept it in the register, or type the midday temperature.",
      ],
    };
  const patch: ProductValues = {};
  for (const field of fields) {
    if (field.key !== "observedTemperature") continue;
    if (observation.temperature_c == null) continue;
    patch[field.key] = (
      Math.round(observation.temperature_c * 10) / 10
    ).toString();
  }
  return {
    patch,
    notes:
      Object.keys(patch).length > 0
        ? []
        : ["The 12:00 observation has no air temperature."],
  };
}
