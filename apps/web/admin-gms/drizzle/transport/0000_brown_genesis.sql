CREATE TYPE "public"."bus_day_type" AS ENUM('daily', 'sun_hol', 'mon_sat');--> statement-breakpoint
CREATE TYPE "public"."bus_direction" AS ENUM('inbound', 'outbound');--> statement-breakpoint
CREATE TABLE "routes" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "routes_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"start_time" time NOT NULL,
	"end_time" time NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shifts_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "stops" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "stops_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "trip_stops" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"stop_id" integer NOT NULL,
	"group_time" time,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"route_id" integer NOT NULL,
	"shift_id" integer NOT NULL,
	"direction" "bus_direction" NOT NULL,
	"day_type" "bus_day_type" NOT NULL,
	"depart_time" time NOT NULL,
	"arrive_time" time,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_stop_id_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_route_id_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_trip_stops_trip" ON "trip_stops" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "idx_trip_stops_stop" ON "trip_stops" USING btree ("stop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_trips_route_shift_dir_day" ON "trips" USING btree ("route_id","shift_id","direction","day_type");--> statement-breakpoint
CREATE INDEX "idx_trips_route" ON "trips" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX "idx_trips_shift" ON "trips" USING btree ("shift_id");