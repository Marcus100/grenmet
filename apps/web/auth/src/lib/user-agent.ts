// Enough to recognise your own devices in the sessions list; not a full parser.
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\//u, "Edge"],
  [/OPR\/|Opera/u, "Opera"],
  [/Firefox\//u, "Firefox"],
  [/Chrome\/|CriOS\//u, "Chrome"],
  [/Safari\//u, "Safari"],
];

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone|iPad|iPod/u, "iOS"],
  [/Android/u, "Android"],
  [/Windows/u, "Windows"],
  [/Mac OS X|Macintosh/u, "macOS"],
  [/CrOS/u, "ChromeOS"],
  [/Linux/u, "Linux"],
];

const MOBILE = /Mobi|iPhone|Android/u;

function match(
  table: ReadonlyArray<readonly [RegExp, string]>,
  value: string
): string | null {
  for (const [pattern, name] of table) {
    if (pattern.test(value)) return name;
  }
  return null;
}

export interface DeviceDescription {
  readonly label: string;
  readonly mobile: boolean;
}

export function describeDevice(
  userAgent: string | null | undefined
): DeviceDescription {
  if (!userAgent) return { label: "Unknown device", mobile: false };
  const browser = match(BROWSERS, userAgent);
  const system = match(SYSTEMS, userAgent);
  const mobile = MOBILE.test(userAgent);
  if (browser && system) return { label: `${browser} on ${system}`, mobile };
  return { label: browser ?? system ?? "Unknown device", mobile };
}
