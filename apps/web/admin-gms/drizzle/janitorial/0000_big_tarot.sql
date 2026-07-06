CREATE TYPE "public"."period_unit" AS ENUM('minute', 'day');--> statement-breakpoint
CREATE TABLE "activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "activities_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "area_bundle_refs" (
	"id" serial PRIMARY KEY NOT NULL,
	"area_id" integer NOT NULL,
	"bundle_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "area_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"area_id" integer NOT NULL,
	"activity_id" integer NOT NULL,
	"freq_count" integer NOT NULL,
	"freq_period_value" integer NOT NULL,
	"freq_period_unit" "period_unit" NOT NULL,
	"mode" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer NOT NULL,
	"section_id" integer,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buildings" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "buildings_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"building_id" integer NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_bundle_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"bundle_id" integer NOT NULL,
	"activity_id" integer NOT NULL,
	"freq_count" integer NOT NULL,
	"freq_period_value" integer NOT NULL,
	"freq_period_unit" "period_unit" NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_bundles" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "task_bundles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "area_bundle_refs" ADD CONSTRAINT "area_bundle_refs_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_bundle_refs" ADD CONSTRAINT "area_bundle_refs_bundle_id_task_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."task_bundles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_tasks" ADD CONSTRAINT "area_tasks_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_tasks" ADD CONSTRAINT "area_tasks_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_building_id_buildings_id_fk" FOREIGN KEY ("building_id") REFERENCES "public"."buildings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_bundle_items" ADD CONSTRAINT "task_bundle_items_bundle_id_task_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."task_bundles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_bundle_items" ADD CONSTRAINT "task_bundle_items_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_area_bundle_refs" ON "area_bundle_refs" USING btree ("area_id","bundle_id");--> statement-breakpoint
CREATE INDEX "idx_area_tasks_area" ON "area_tasks" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "idx_area_tasks_activity" ON "area_tasks" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "idx_areas_building" ON "areas" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "idx_areas_section" ON "areas" USING btree ("section_id");--> statement-breakpoint
CREATE INDEX "idx_sections_building" ON "sections" USING btree ("building_id");--> statement-breakpoint
CREATE INDEX "idx_task_bundle_items_bundle" ON "task_bundle_items" USING btree ("bundle_id");