/**
 * Pure parser for the janitorial cleaning-spec seed CSV
 * (apps/web/admin-gms/seed/janitorial-spec.csv).
 *
 * Kept dependency-free and side-effect-free so it can be unit-tested with Vitest
 * and imported by the Node seed runner (scripts/seed-janitorial.mjs). It does NOT
 * touch the database — it normalises rows into deduplicated entities keyed for the
 * seed runner to resolve into foreign keys.
 */

export type PeriodUnit = "minute" | "day";

export interface Frequency {
  count: number;
  periodUnit: PeriodUnit;
  periodValue: number;
}

export interface ParsedBuilding {
  code: string;
  name: string;
  sortOrder: number;
}
export interface ParsedSection {
  buildingCode: string;
  name: string;
  sortOrder: number;
}
export interface ParsedArea {
  buildingCode: string;
  key: string;
  name: string;
  sectionName: string | null;
  sortOrder: number;
}
export interface ParsedActivity {
  name: string;
  slug: string;
}
export interface ParsedBundle {
  name: string;
  slug: string;
}
export interface ParsedBundleItem {
  activitySlug: string;
  bundleSlug: string;
  frequency: Frequency;
  sortOrder: number;
}
export interface ParsedAreaTask {
  activitySlug: string;
  areaKey: string;
  frequency: Frequency;
  mode: string | null;
  sortOrder: number;
}
export interface ParsedAreaBundleRef {
  areaKey: string;
  bundleSlug: string;
  sortOrder: number;
}

export interface ParsedSpec {
  activities: ParsedActivity[];
  areaBundleRefs: ParsedAreaBundleRef[];
  areas: ParsedArea[];
  areaTasks: ParsedAreaTask[];
  buildings: ParsedBuilding[];
  bundleItems: ParsedBundleItem[];
  bundles: ParsedBundle[];
  sections: ParsedSection[];
}

const FREQUENCY_REGEX = /^(\d+)\/(\d+)(min)?$/;
const EXPECTED_HEADER = [
  "kind",
  "building",
  "section",
  "area",
  "mode",
  "activity",
  "frequency",
];

/** Parse a "N/M" or "N/Mmin" cadence code into structured form. */
export function parseFrequency(raw: string): Frequency {
  const match = FREQUENCY_REGEX.exec(raw.trim());
  if (!match) {
    throw new Error(`Invalid frequency code: "${raw}"`);
  }
  return {
    count: Number.parseInt(match[1], 10),
    periodValue: Number.parseInt(match[2], 10),
    periodUnit: match[3] ? "minute" : "day",
  };
}

/** Human-readable cadence, e.g. "2×/day", "3×/5 days", "1×/15 min". */
export function formatFrequency(freq: Frequency): string {
  const unit = freq.periodUnit === "minute" ? "min" : "day";
  const period = freq.periodValue === 1 ? unit : `${freq.periodValue} ${unit}s`;
  return `${freq.count}×/${period}`;
}

/** Lower-case, hyphenated slug used as the dedup key for activities and bundles. */
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

interface SpecRow {
  activity: string;
  area: string;
  building: string;
  frequency: string;
  kind: string;
  mode: string;
  section: string;
}

/** Minimal RFC-4180 CSV reader (handles quoted fields and escaped quotes). */
function parseCsvGrid(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") {
      field += char;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((cells) => cells.some((cell) => cell !== ""));
}

function toSpecRows(text: string): SpecRow[] {
  const grid = parseCsvGrid(text);
  if (grid.length === 0) {
    throw new Error("Empty janitorial spec CSV");
  }
  const [header, ...body] = grid;
  const normalizedHeader = header.map((cell) => cell.trim().toLowerCase());
  if (normalizedHeader.join(",") !== EXPECTED_HEADER.join(",")) {
    throw new Error(
      `Unexpected CSV header. Expected: ${EXPECTED_HEADER.join(",")}`
    );
  }
  return body.map((cells) => ({
    kind: (cells[0] ?? "").trim(),
    building: (cells[1] ?? "").trim(),
    section: (cells[2] ?? "").trim(),
    area: (cells[3] ?? "").trim(),
    mode: (cells[4] ?? "").trim(),
    activity: (cells[5] ?? "").trim(),
    frequency: (cells[6] ?? "").trim(),
  }));
}

function areaKeyFor(
  buildingCode: string,
  sectionName: string | null,
  areaName: string
): string {
  return `${buildingCode}::${sectionName ?? ""}::${areaName}`;
}

export function parseSpec(csvText: string): ParsedSpec {
  const rows = toSpecRows(csvText);

  const buildings = new Map<string, ParsedBuilding>();
  const sections = new Map<string, ParsedSection>();
  const areas = new Map<string, ParsedArea>();
  const activities = new Map<string, ParsedActivity>();
  const bundles = new Map<string, ParsedBundle>();
  const bundleItems: ParsedBundleItem[] = [];
  const areaTasks: ParsedAreaTask[] = [];
  const areaBundleRefs: ParsedAreaBundleRef[] = [];

  let buildingSort = 0;
  const sectionSortByBuilding = new Map<string, number>();
  const areaSortByGroup = new Map<string, number>();
  const taskSortByArea = new Map<string, number>();
  const itemSortByBundle = new Map<string, number>();

  const registerBuilding = (name: string): string => {
    const code = slugify(name);
    if (!buildings.has(code)) {
      buildings.set(code, { name, code, sortOrder: buildingSort++ });
    }
    return code;
  };

  const registerSection = (buildingCode: string, name: string): void => {
    const key = `${buildingCode}::${name}`;
    if (!sections.has(key)) {
      const sortOrder = sectionSortByBuilding.get(buildingCode) ?? 0;
      sectionSortByBuilding.set(buildingCode, sortOrder + 1);
      sections.set(key, { buildingCode, name, sortOrder });
    }
  };

  const registerArea = (
    buildingCode: string,
    sectionName: string | null,
    name: string
  ): string => {
    const key = areaKeyFor(buildingCode, sectionName, name);
    if (!areas.has(key)) {
      const groupKey = `${buildingCode}::${sectionName ?? ""}`;
      const sortOrder = areaSortByGroup.get(groupKey) ?? 0;
      areaSortByGroup.set(groupKey, sortOrder + 1);
      areas.set(key, { key, buildingCode, sectionName, name, sortOrder });
    }
    return key;
  };

  const registerActivity = (name: string): string => {
    const slug = slugify(name);
    if (!activities.has(slug)) {
      activities.set(slug, { slug, name });
    }
    return slug;
  };

  const registerBundle = (name: string): string => {
    const slug = slugify(name);
    if (!bundles.has(slug)) {
      bundles.set(slug, { slug, name });
    }
    return slug;
  };

  const nextTaskSort = (areaKey: string): number => {
    const sortOrder = taskSortByArea.get(areaKey) ?? 0;
    taskSortByArea.set(areaKey, sortOrder + 1);
    return sortOrder;
  };

  for (const row of rows) {
    if (row.kind === "bundle_item") {
      const bundleSlug = registerBundle(row.area);
      const activitySlug = registerActivity(row.activity);
      const sortOrder = itemSortByBundle.get(bundleSlug) ?? 0;
      itemSortByBundle.set(bundleSlug, sortOrder + 1);
      bundleItems.push({
        bundleSlug,
        activitySlug,
        frequency: parseFrequency(row.frequency),
        sortOrder,
      });
      continue;
    }

    const buildingCode = registerBuilding(row.building);
    const sectionName = row.section === "" ? null : row.section;
    if (sectionName !== null) {
      registerSection(buildingCode, sectionName);
    }
    const areaKey = registerArea(buildingCode, sectionName, row.area);

    if (row.kind === "task") {
      const activitySlug = registerActivity(row.activity);
      areaTasks.push({
        areaKey,
        activitySlug,
        mode: row.mode === "" ? null : row.mode,
        frequency: parseFrequency(row.frequency),
        sortOrder: nextTaskSort(areaKey),
      });
    } else if (row.kind === "bundle_ref") {
      // For a bundle_ref row the bundle name lives in the `activity` column.
      const bundleSlug = registerBundle(row.activity);
      areaBundleRefs.push({
        areaKey,
        bundleSlug,
        sortOrder: nextTaskSort(areaKey),
      });
    } else {
      throw new Error(`Unknown row kind: "${row.kind}"`);
    }
  }

  return {
    buildings: [...buildings.values()],
    sections: [...sections.values()],
    areas: [...areas.values()],
    activities: [...activities.values()],
    bundles: [...bundles.values()],
    bundleItems,
    areaTasks,
    areaBundleRefs,
  };
}
