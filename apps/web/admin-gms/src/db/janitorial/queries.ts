import "server-only";

import { asc } from "drizzle-orm";
import { janitorialDb as db } from "./index";
import type { Frequency } from "./parse-spec";
import {
  activities,
  areaBundleRefs,
  areas,
  areaTasks,
  buildings,
  sections,
  taskBundleItems,
  taskBundles,
} from "./schema";

export interface TaskView {
  activity: string;
  frequency: Frequency;
  id: number;
  mode: string | null;
}

export interface BundleView {
  id: number;
  items: { activity: string; frequency: Frequency }[];
  name: string;
}

export interface AreaView {
  bundles: BundleView[];
  id: number;
  name: string;
  tasks: TaskView[];
}

export interface SectionView {
  areas: AreaView[];
  id: number | null;
  name: string | null;
}

export interface BuildingView {
  id: number;
  name: string;
  sections: SectionView[];
}

/**
 * Fetch the full janitorial spec as a nested building -> section -> area -> task
 * tree for the read-only view. Areas with no section are grouped under a leading
 * section-less group. Terrazzo bundle references are resolved to their items.
 */
export async function getJanitorialSpec(): Promise<BuildingView[]> {
  const [
    buildingRows,
    sectionRows,
    areaRows,
    activityRows,
    taskRows,
    bundleRows,
    bundleItemRows,
    bundleRefRows,
  ] = await Promise.all([
    db.select().from(buildings).orderBy(asc(buildings.sortOrder)),
    db.select().from(sections).orderBy(asc(sections.sortOrder)),
    db.select().from(areas).orderBy(asc(areas.sortOrder)),
    db.select().from(activities),
    db.select().from(areaTasks).orderBy(asc(areaTasks.sortOrder)),
    db.select().from(taskBundles),
    db.select().from(taskBundleItems).orderBy(asc(taskBundleItems.sortOrder)),
    db.select().from(areaBundleRefs).orderBy(asc(areaBundleRefs.sortOrder)),
  ]);

  const activityName = new Map(activityRows.map((a) => [a.id, a.name]));

  const bundleView = new Map<number, BundleView>(
    bundleRows.map((b) => [b.id, { id: b.id, name: b.name, items: [] }])
  );
  for (const item of bundleItemRows) {
    bundleView.get(item.bundleId)?.items.push({
      activity: activityName.get(item.activityId) ?? "Unknown",
      frequency: {
        count: item.freqCount,
        periodValue: item.freqPeriodValue,
        periodUnit: item.freqPeriodUnit,
      },
    });
  }

  const areaView = new Map<number, AreaView>(
    areaRows.map((a) => [
      a.id,
      { id: a.id, name: a.name, tasks: [], bundles: [] },
    ])
  );
  for (const task of taskRows) {
    areaView.get(task.areaId)?.tasks.push({
      id: task.id,
      activity: activityName.get(task.activityId) ?? "Unknown",
      mode: task.mode,
      frequency: {
        count: task.freqCount,
        periodValue: task.freqPeriodValue,
        periodUnit: task.freqPeriodUnit,
      },
    });
  }
  for (const ref of bundleRefRows) {
    const bundle = bundleView.get(ref.bundleId);
    if (bundle) {
      areaView.get(ref.areaId)?.bundles.push(bundle);
    }
  }

  // Group areas by (buildingId, sectionId), preserving DB sort order.
  const sectionName = new Map(sectionRows.map((s) => [s.id, s.name]));
  const sectionBuilding = new Map(sectionRows.map((s) => [s.id, s.buildingId]));

  return buildingRows.map((building) => {
    const buildingAreas = areaRows.filter((a) => a.buildingId === building.id);

    const groups: SectionView[] = [];
    const groupIndex = new Map<number | null, SectionView>();
    const ensureGroup = (sectionId: number | null): SectionView => {
      let group = groupIndex.get(sectionId);
      if (!group) {
        group = {
          id: sectionId,
          name:
            sectionId === null ? null : (sectionName.get(sectionId) ?? null),
          areas: [],
        };
        groupIndex.set(sectionId, group);
        groups.push(group);
      }
      return group;
    };

    // Section-less areas first, then each real section in sort order.
    for (const area of buildingAreas) {
      if (area.sectionId === null) {
        ensureGroup(null).areas.push(areaView.get(area.id) as AreaView);
      }
    }
    for (const section of sectionRows) {
      if (sectionBuilding.get(section.id) !== building.id) continue;
      for (const area of buildingAreas) {
        if (area.sectionId === section.id) {
          ensureGroup(section.id).areas.push(areaView.get(area.id) as AreaView);
        }
      }
    }

    return { id: building.id, name: building.name, sections: groups };
  });
}
