/**
 * Tonight's sky for Grenada without a library: sunrise and sunset from the
 * standard sunrise equation (about a minute of accuracy at our latitude) and
 * the moon's phase from the mean synodic month. Pure, so it is testable.
 */
const RAD = Math.PI / 180;
const DAY_MS = 86_400_000;
const UNIX_EPOCH_JD = 2_440_587.5;
const J2000 = 2_451_545;
const SYNODIC_MONTH = 29.530_588_853;
/** A known new moon: 6 Jan 2000, 18:14 UTC. */
const NEW_MOON_JD = 2_451_550.1;

/** Point Salines, St George's. */
export const GRENADA = { latitude: 12.05, longitude: -61.75 } as const;

const toJulian = (date: Date) => date.getTime() / DAY_MS + UNIX_EPOCH_JD;
const fromJulian = (jd: number) => new Date((jd - UNIX_EPOCH_JD) * DAY_MS);

/** Sunrise and sunset (UTC instants) for a calendar day `YYYY-MM-DD`. */
export function sunTimes(
  isoDate: string,
  { latitude, longitude }: { latitude: number; longitude: number } = GRENADA
): { sunrise: Date; sunset: Date } {
  const noon = new Date(`${isoDate}T12:00:00Z`);
  const n = Math.ceil(toJulian(noon) - J2000 + 0.0008);
  const meanNoon = n - longitude / 360;
  const anomaly = (357.5291 + 0.985_600_28 * meanNoon) % 360;
  const m = anomaly * RAD;
  const centre =
    1.9148 * Math.sin(m) + 0.02 * Math.sin(2 * m) + 0.0003 * Math.sin(3 * m);
  const lambda = ((anomaly + centre + 180 + 102.9372) % 360) * RAD;
  const transit =
    J2000 + meanNoon + 0.0053 * Math.sin(m) - 0.0069 * Math.sin(2 * lambda);
  const declination = Math.asin(Math.sin(lambda) * Math.sin(23.4397 * RAD));
  const phi = latitude * RAD;
  const hourAngle = Math.acos(
    (Math.sin(-0.833 * RAD) - Math.sin(phi) * Math.sin(declination)) /
      (Math.cos(phi) * Math.cos(declination))
  );
  const half = hourAngle / RAD / 360;
  return {
    sunrise: fromJulian(transit - half),
    sunset: fromJulian(transit + half),
  };
}

const PHASES = [
  [0.0339, "New moon"],
  [0.216, "Waxing crescent"],
  [0.284, "First quarter"],
  [0.466, "Waxing gibbous"],
  [0.534, "Full moon"],
  [0.716, "Waning gibbous"],
  [0.784, "Last quarter"],
  [0.966, "Waning crescent"],
  [1, "New moon"],
] as const;

/** The moon's phase name and lit fraction (0–1) at an instant. */
export function moonPhase(date: Date): { name: string; illumination: number } {
  const age = ((((toJulian(date) - NEW_MOON_JD) / SYNODIC_MONTH) % 1) + 1) % 1;
  const name = PHASES.find(([limit]) => age < limit)?.[1] ?? "New moon";
  return { name, illumination: (1 - Math.cos(2 * Math.PI * age)) / 2 };
}
