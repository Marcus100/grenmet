import {
  index,
  integer,
  pgEnum,
  pgTable,
  serial,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/**
 * Janitorial cleaning specification (GAA airport "Areas for Cleaning").
 *
 * Hierarchy: building -> section (optional) -> area -> task (activity + frequency).
 * Activities are a shared, deduplicated catalogue. "Terrazzo Maintenance and Floor
 * Care" is a reusable bundle referenced by many areas ("see page 1"), modelled as
 * task_bundles + task_bundle_items and linked via area_bundle_refs.
 *
 * Frequency is stored structured ({count, periodValue, periodUnit}), never the raw
 * "2/1" string, so downstream schedulers can compute cadence and "due now" state.
 */

export const periodUnit = pgEnum("period_unit", ["minute", "day"]);

export const buildings = pgTable("buildings", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code").notNull().unique(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export const sections = pgTable(
  "sections",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id")
      .notNull()
      .references(() => buildings.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("idx_sections_building").on(table.buildingId)]
);

export const areas = pgTable(
  "areas",
  {
    id: serial("id").primaryKey(),
    buildingId: integer("building_id")
      .notNull()
      .references(() => buildings.id),
    // Nullable: some areas (Restrooms, Terrazzo) sit directly under a building.
    sectionId: integer("section_id").references(() => sections.id),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_areas_building").on(table.buildingId),
    index("idx_areas_section").on(table.sectionId),
  ]
);

export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

export const taskBundles = pgTable("task_bundles", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
});

export const areaTasks = pgTable(
  "area_tasks",
  {
    id: serial("id").primaryKey(),
    areaId: integer("area_id")
      .notNull()
      .references(() => areas.id),
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id),
    freqCount: integer("freq_count").notNull(),
    freqPeriodValue: integer("freq_period_value").notNull(),
    freqPeriodUnit: periodUnit("freq_period_unit").notNull(),
    // e.g. "Light Cleaning" / "Deep Cleaning" (GAA Executive Lounge); null otherwise.
    mode: text("mode"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    index("idx_area_tasks_area").on(table.areaId),
    index("idx_area_tasks_activity").on(table.activityId),
  ]
);

export const taskBundleItems = pgTable(
  "task_bundle_items",
  {
    id: serial("id").primaryKey(),
    bundleId: integer("bundle_id")
      .notNull()
      .references(() => taskBundles.id),
    activityId: integer("activity_id")
      .notNull()
      .references(() => activities.id),
    freqCount: integer("freq_count").notNull(),
    freqPeriodValue: integer("freq_period_value").notNull(),
    freqPeriodUnit: periodUnit("freq_period_unit").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [index("idx_task_bundle_items_bundle").on(table.bundleId)]
);

export const areaBundleRefs = pgTable(
  "area_bundle_refs",
  {
    id: serial("id").primaryKey(),
    areaId: integer("area_id")
      .notNull()
      .references(() => areas.id),
    bundleId: integer("bundle_id")
      .notNull()
      .references(() => taskBundles.id),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("uq_area_bundle_refs").on(table.areaId, table.bundleId),
  ]
);

export type Building = typeof buildings.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type Area = typeof areas.$inferSelect;
export type Activity = typeof activities.$inferSelect;
export type TaskBundle = typeof taskBundles.$inferSelect;
export type AreaTask = typeof areaTasks.$inferSelect;
export type TaskBundleItem = typeof taskBundleItems.$inferSelect;
export type AreaBundleRef = typeof areaBundleRefs.$inferSelect;
