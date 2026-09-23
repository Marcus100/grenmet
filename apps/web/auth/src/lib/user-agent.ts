// Enough to recognise your own devices in the sessions list; not a full parser.
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/Firefox\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Safari\//, "Safari"],
];

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone|iPad|iPod/, "iOS"],
  [/Android/, "Android"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "macOS"],
  [/CrOS/, "ChromeOS"],
  [/Linux/, "Linux"],
];

const MOBILE = /Mobi|iPhone|Android/;

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
