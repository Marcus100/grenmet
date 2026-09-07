// One-time (re-runnable) seed for the janitorial cleaning-spec catalogue.
//
// Reads the hand-verified CSV (seed/janitorial-spec.csv), parses it with the
// unit-tested pure parser, and loads it into the janitorial Drizzle database.
// Create-once: preserves catalogue edits on subsequent runs. Node natively strips the types
// from the imported .ts modules (Node >= 22.18), so no build step / tsx needed.
//
//   pnpm --filter @barrelsgd/web-gaa-admin db:janitorial:seed
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { parseSpec } from "../src/db/janitorial/parse-spec.ts";
import {
  activities,
  areaBundleRefs,
  areas,
  areaTasks,
  buildings,
  sections,
  taskBundleItems,
  taskBundles,
} from "../src/db/janitorial/schema.ts";
import { databaseConfig } from "./database-config.mjs";

const { Pool } = pg;

const here = dirname(fileURLToPath(import.meta.url));
const csvPath = join(here, "..", "seed", "janitorial-spec.csv");
const spec = parseSpec(readFileSync(csvPath, "utf8"));

const pool = new Pool(databaseConfig("janitorial"));
const client = await pool.connect();
const db = drizzle(client, { casing: "snake_case" });
try {
  await client.query("BEGIN");
  await client.query("SELECT pg_advisory_xact_lock(73190506)");
  await client.query(
    "CREATE TABLE IF NOT EXISTS baseline_step (key text PRIMARY KEY, completed_at timestamptz NOT NULL DEFAULT now())"
  );
  const seeded = await client.query(
    "SELECT 1 FROM baseline_step WHERE key = $1",
    ["janitorial-v1"]
  );
  if (seeded.rowCount) {
    console.log("janitorial already initialised; online edits preserved");
  } else {
    const existing = await client.query(
      'SELECT 1 FROM "buildings" UNION ALL SELECT 1 FROM "sections" UNION ALL SELECT 1 FROM "areas" UNION ALL SELECT 1 FROM "activities" UNION ALL SELECT 1 FROM "task_bundles" UNION ALL SELECT 1 FROM "task_bundle_items" UNION ALL SELECT 1 FROM "area_tasks" UNION ALL SELECT 1 FROM "area_bundle_refs" LIMIT 1'
    );
    if (existing.rowCount) {
      throw new Error(
        "Existing janitorial data requires review; refusing to overwrite it"
      );
    }

    const buildingRows = await db
      .insert(buildings)
      .values(
        spec.buildings.map((b) => ({
          name: b.name,
          code: b.code,
          sortOrder: b.sortOrder,
        }))
      )
      .returning({ id: buildings.id });
    const buildingIdByCode = new Map(
      spec.buildings.map((b, i) => [b.code, buildingRows[i].id])
    );

    const sectionIdByKey = new Map();
    if (spec.sections.length > 0) {
      const sectionRows = await db
        .insert(sections)
        .values(
          spec.sections.map((s) => ({
            buildingId: buildingIdByCode.get(s.buildingCode),
            name: s.name,
            sortOrder: s.sortOrder,
          }))
        )
        .returning({ id: sections.id });
      spec.sections.forEach((s, i) => {
        sectionIdByKey.set(`${s.buildingCode}::${s.name}`, sectionRows[i].id);
      });
    }

    const areaRows = await db
      .insert(areas)
      .values(
        spec.areas.map((a) => ({
          buildingId: buildingIdByCode.get(a.buildingCode),
          sectionId: a.sectionName
            ? sectionIdByKey.get(`${a.buildingCode}::${a.sectionName}`)
            : null,
          name: a.name,
          sortOrder: a.sortOrder,
        }))
      )
      .returning({ id: areas.id });
    const areaIdByKey = new Map(
      spec.areas.map((a, i) => [a.key, areaRows[i].id])
    );

    const activityRows = await db
      .insert(activities)
      .values(spec.activities.map((a) => ({ slug: a.slug, name: a.name })))
      .returning({ id: activities.id });
    const activityIdBySlug = new Map(
      spec.activities.map((a, i) => [a.slug, activityRows[i].id])
    );

    const bundleIdBySlug = new Map();
    if (spec.bundles.length > 0) {
      const bundleRows = await db
        .insert(taskBundles)
        .values(spec.bundles.map((b) => ({ slug: b.slug, name: b.name })))
        .returning({ id: taskBundles.id });
      spec.bundles.forEach((b, i) => {
        bundleIdBySlug.set(b.slug, bundleRows[i].id);
      });
    }

    if (spec.bundleItems.length > 0) {
      await db.insert(taskBundleItems).values(
        spec.bundleItems.map((it) => ({
          bundleId: bundleIdBySlug.get(it.bundleSlug),
          activityId: activityIdBySlug.get(it.activitySlug),
          freqCount: it.frequency.count,
          freqPeriodValue: it.frequency.periodValue,
          freqPeriodUnit: it.frequency.periodUnit,
          sortOrder: it.sortOrder,
        }))
      );
    }

    await db.insert(areaTasks).values(
      spec.areaTasks.map((t) => ({
        areaId: areaIdByKey.get(t.areaKey),
        activityId: activityIdBySlug.get(t.activitySlug),
        freqCount: t.frequency.count,
        freqPeriodValue: t.frequency.periodValue,
        freqPeriodUnit: t.frequency.periodUnit,
        mode: t.mode,
        sortOrder: t.sortOrder,
      }))
    );

    if (spec.areaBundleRefs.length > 0) {
      await db.insert(areaBundleRefs).values(
        spec.areaBundleRefs.map((r) => ({
          areaId: areaIdByKey.get(r.areaKey),
          bundleId: bundleIdBySlug.get(r.bundleSlug),
          sortOrder: r.sortOrder,
        }))
      );
    }

    console.log(
      `Seeded janitorial: ${spec.buildings.length} buildings, ${spec.sections.length} sections, ` +
        `${spec.areas.length} areas, ${spec.activities.length} activities, ${spec.areaTasks.length} tasks, ` +
        `${spec.bundles.length} bundle(s) with ${spec.bundleItems.length} items, ${spec.areaBundleRefs.length} bundle refs`
    );
    await client.query("INSERT INTO baseline_step(key) VALUES ($1)", [
      "janitorial-v1",
    ]);
  }
  await client.query("COMMIT");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
