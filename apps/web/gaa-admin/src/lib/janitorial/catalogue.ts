// Pure views over the FastAPI janitorial catalogue (`/api/v1/janitorial/catalogue`)
// for the /janitor admin portal. Kept React-free so they are unit-testable.

import type {
  JanitorialArea,
  JanitorialBuilding,
  JanitorialFrequency,
  JanitorialSection,
} from "@barrelsgd/api-client";

const MINUTES_PER_DAY = 1440;
const HOURLY = 60;

export interface Frequency {
  count: number;
  periodUnit: string;
  periodValue: number;
}

/** How often an area needs attention, from its most frequent task. */
export type Cadence = "high" | "daily" | "periodic";

export const CADENCE_LABELS: Record<Cadence, string> = {
  high: "Hourly or more",
  daily: "Daily",
  periodic: "Less than daily",
};

export type SpaceType = JanitorialArea["spaceType"];

export const SPACE_TYPE_LABELS: Record<SpaceType, string> = {
  restroom: "Restroom",
  concourse: "Concourse",
  lounge: "Lounge",
  boarding: "Boarding",
  food: "Food service",
  circulation: "Circulation",
  vertical_transport: "Lifts & stairs",
  office: "Office",
  storage: "Storage",
  technical: "Technical",
  exterior: "Exterior",
  other: "Other",
};

/** APPA cleanliness levels (1 = orderly spotlessness … 5 = unkempt neglect). */
export const APPA_LEVEL_LABELS: Record<number, string> = {
  1: "Orderly spotlessness",
  2: "Ordinary tidiness",
  3: "Casual inattention",
  4: "Moderate dinginess",
  5: "Unkempt neglect",
};

export const SITE_CODES = ["GND", "CRU"] as const;
export type SiteCode = (typeof SITE_CODES)[number];

/** The requested site code, defaulting to MBIA (GND). */
export function siteParam(value: string | string[] | undefined): SiteCode {
  const code = typeof value === "string" ? value.toUpperCase() : "";
  return (SITE_CODES as readonly string[]).includes(code)
    ? (code as SiteCode)
    : "GND";
}

export interface AreaRow {
  active: boolean;
  buildingId: number;
  buildingName: string;
  bundleNames: string[];
  cadence: Cadence;
  cleanlinessLevel: number | null;
  code: string;
  /** The most frequent task or bundle item; null for an area with no work. */
  fastest: Frequency | null;
  id: number;
  name: string;
  /** Scheduled task occurrences per day, tasks and bundle items combined. */
  perDay: number;
  quantity: number;
  sectionName: string | null;
  spaceType: SpaceType;
  taskCount: number;
}

export interface AreaFilters {
  building?: string;
  cadence?: string;
  q?: string;
  space?: string;
  /** "all" includes inactive areas and buildings. */
  status?: string;
}

function periodMinutes(frequency: Frequency): number {
  const unit = frequency.periodUnit === "minute" ? 1 : MINUTES_PER_DAY;
  return frequency.periodValue * unit;
}

/** Minutes between occurrences, e.g. 1×/15 mins → 15, 2×/day → 720. */
export function intervalMinutes(frequency: Frequency): number {
  return periodMinutes(frequency) / Math.max(frequency.count, 1);
}

/** Scheduled occurrences per day, e.g. 1×/15 mins → 96, 3×/5 days → 0.6. */
export function occurrencesPerDay(frequency: Frequency): number {
  return (frequency.count * MINUTES_PER_DAY) / periodMinutes(frequency);
}

export function cadenceOf(frequency: Frequency | null): Cadence {
  if (!frequency) return "periodic";
  const interval = intervalMinutes(frequency);
  if (interval <= HOURLY) return "high";
  if (interval <= MINUTES_PER_DAY) return "daily";
  return "periodic";
}

function areaFrequencies(area: JanitorialArea): JanitorialFrequency[] {
  return [
    ...area.tasks.filter((task) => task.active).map((task) => task.frequency),
    ...area.bundles.flatMap((bundle) =>
      bundle.items.map((item) => item.frequency)
    ),
  ];
}

function sectionName(
  sections: JanitorialSection[],
  id: number | null | undefined
): string | null {
  if (id == null) return null;
  return sections.find((section) => section.id === id)?.name ?? null;
}

export function toRow(
  building: JanitorialBuilding,
  area: JanitorialArea
): AreaRow {
  const frequencies = areaFrequencies(area);
  let fastest: Frequency | null = null;
  for (const frequency of frequencies) {
    if (!fastest || intervalMinutes(frequency) < intervalMinutes(fastest)) {
      fastest = frequency;
    }
  }
  return {
    active: area.active && building.active,
    buildingId: building.id,
    buildingName: building.name,
    bundleNames: area.bundles.map((bundle) => bundle.name),
    cadence: cadenceOf(fastest),
    cleanlinessLevel: area.cleanlinessLevel ?? null,
    code: area.code,
    fastest,
    id: area.id,
    name: area.name,
    perDay: frequencies.reduce(
      (sum, frequency) => sum + occurrencesPerDay(frequency),
      0
    ),
    quantity: area.quantity,
    sectionName: sectionName(building.sections, area.sectionId),
    spaceType: area.spaceType,
    taskCount: frequencies.length,
  };
}

/** One row per area, in catalogue order (inactive areas included). */
export function flattenAreas(buildings: JanitorialBuilding[]): AreaRow[] {
  return buildings.flatMap((building) =>
    building.areas.map((area) => toRow(building, area))
  );
}

function isCadence(value: string | undefined): value is Cadence {
  return value !== undefined && value in CADENCE_LABELS;
}

function isSpaceType(value: string | undefined): value is SpaceType {
  return value !== undefined && value in SPACE_TYPE_LABELS;
}

export function filterAreas(rows: AreaRow[], filters: AreaFilters): AreaRow[] {
  const query = filters.q?.trim().toLowerCase() ?? "";
  const building = Number(filters.building);
  const cadence = isCadence(filters.cadence) ? filters.cadence : undefined;
  const space = isSpaceType(filters.space) ? filters.space : undefined;
  const includeInactive = filters.status === "all";
  return rows.filter(
    (row) =>
      (includeInactive || row.active) &&
      (!(filters.building && Number.isSafeInteger(building)) ||
        row.buildingId === building) &&
      (!cadence || row.cadence === cadence) &&
      (!space || row.spaceType === space) &&
      (!query ||
        [
          row.name,
          row.code,
          row.sectionName ?? "",
          row.buildingName,
          ...row.bundleNames,
        ]
          .join(" ")
          .toLowerCase()
          .includes(query))
  );
}

export interface AreaLocation {
  area: JanitorialArea;
  building: JanitorialBuilding;
  row: AreaRow;
  section: JanitorialSection | null;
}

export function findArea(
  buildings: JanitorialBuilding[],
  id: number
): AreaLocation | undefined {
  for (const building of buildings) {
    const area = building.areas.find((candidate) => candidate.id === id);
    if (area) {
      return {
        area,
        building,
        row: toRow(building, area),
        section:
          building.sections.find((section) => section.id === area.sectionId) ??
          null,
      };
    }
  }
  return undefined;
}

export interface BuildingWorkload {
  areas: number;
  highFrequencyAreas: number;
  id: number;
  kind: JanitorialBuilding["kind"];
  name: string;
  perDay: number;
}

/** Workload of active buildings, counting active areas only. */
export function workloadByBuilding(
  buildings: JanitorialBuilding[],
  rows: AreaRow[]
): BuildingWorkload[] {
  return buildings
    .filter((building) => building.active)
    .map((building) => {
      const own = rows.filter(
        (row) => row.buildingId === building.id && row.active
      );
      return {
        areas: own.length,
        highFrequencyAreas: own.filter((row) => row.cadence === "high").length,
        id: building.id,
        kind: building.kind,
        name: building.name,
        perDay: own.reduce((sum, row) => sum + row.perDay, 0),
      };
    });
}

export interface CatalogueSummary {
  areas: number;
  buildings: number;
  highFrequencyAreas: number;
  perDay: number;
  tasks: number;
}

export function summarise(
  buildings: JanitorialBuilding[],
  rows: AreaRow[]
): CatalogueSummary {
  const active = rows.filter((row) => row.active);
  return {
    areas: active.length,
    buildings: buildings.filter((building) => building.active).length,
    highFrequencyAreas: active.filter((row) => row.cadence === "high").length,
    perDay: active.reduce((sum, row) => sum + row.perDay, 0),
    tasks: active.reduce((sum, row) => sum + row.taskCount, 0),
  };
}

/** Active areas that need attention most often, fastest first. */
export function highFrequencyAreas(rows: AreaRow[], limit: number): AreaRow[] {
  const interval = (row: AreaRow) =>
    row.fastest ? intervalMinutes(row.fastest) : Number.POSITIVE_INFINITY;
  return rows
    .filter((row) => row.active && row.cadence === "high")
    .sort((a, b) => interval(a) - interval(b) || b.perDay - a.perDay)
    .slice(0, limit);
}
