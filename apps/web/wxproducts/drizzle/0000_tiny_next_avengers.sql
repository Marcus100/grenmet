CREATE TYPE "public"."obs_source_type" AS ENUM('metar', 'synop');--> statement-breakpoint
CREATE TYPE "public"."color_code" AS ENUM('GREEN', 'ORANGE', 'RED', 'YELLOW');--> statement-breakpoint
CREATE TYPE "public"."aviation_report_type" AS ENUM('METAR', 'SPECI');--> statement-breakpoint
CREATE TYPE "public"."product_status" AS ENUM('archived', 'operational', 'test', 'training');--> statement-breakpoint
CREATE TYPE "public"."product_type" AS ENUM('evening_forecast', 'marine_bulletin', 'midday_weather_report', 'morning_forecast', 'tropical_weather_outlook');--> statement-breakpoint
CREATE TABLE "cap_alerts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cap_alerts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cap_alert_id" text NOT NULL,
	"bundle_id" integer NOT NULL,
	"ibf_assessment_id" text NOT NULL,
	"body" jsonb NOT NULL,
	"issued_at_utc" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cap_bundles" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "cap_bundles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"cap_bundle_id" text NOT NULL,
	"suite_id" text,
	"issued_at_utc" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evening_products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "evening_products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_ref" integer NOT NULL,
	"headline" text NOT NULL,
	"periods" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hourly_summaries" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "hourly_summaries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"valid_hour_utc" timestamp with time zone NOT NULL,
	"source_type" "obs_source_type" NOT NULL,
	"source_metar_id" integer,
	"source_synop_id" integer,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ibf_assessments" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ibf_assessments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"ibf_assessment_id" text NOT NULL,
	"product_id" text NOT NULL,
	"system_id" text,
	"body" jsonb NOT NULL,
	"issued_at_utc" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "marine_products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "marine_products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_ref" integer NOT NULL,
	"color_code" "color_code" NOT NULL,
	"synopsis_summary" text NOT NULL,
	"elements" jsonb NOT NULL,
	"coastal_wave_notes_west" text,
	"coastal_wave_notes_east" text,
	"response_summary_text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aviation_observations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "aviation_observations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"aerodrome_icao" text NOT NULL,
	"report_type" "aviation_report_type" NOT NULL,
	"obs_datetime_utc" timestamp with time zone NOT NULL,
	"issue_datetime_utc" timestamp with time zone NOT NULL,
	"raw_tac" text,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "midday_products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "midday_products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_ref" integer NOT NULL,
	"station_name" text NOT NULL,
	"observation_time_local" text NOT NULL,
	"air_temperature_c" numeric(5, 2) NOT NULL,
	"headline" text NOT NULL,
	"elements" jsonb NOT NULL,
	"education_word_term" text,
	"education_word_definition" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "morning_products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "morning_products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_ref" integer NOT NULL,
	"headline" text NOT NULL,
	"elements" jsonb NOT NULL,
	"product_notes_advisories" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tropical_outlook_products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tropical_outlook_products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_ref" integer NOT NULL,
	"area_description" text NOT NULL,
	"area_geojson" jsonb,
	"sources" jsonb NOT NULL,
	"systems" jsonb NOT NULL,
	"next_update_time_local" text,
	"public_message_plain_language" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_suites" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "product_suites_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"suite_id" text NOT NULL,
	"suite_type" text DEFAULT 'daily_product_suite' NOT NULL,
	"schema_family" text,
	"schema_version" text,
	"suite_issue_datetime_utc" timestamp with time zone,
	"full_suite" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "products_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"product_id" text NOT NULL,
	"product_type" "product_type" NOT NULL,
	"suite_id" text NOT NULL,
	"issue_datetime_utc" timestamp with time zone,
	"metadata" jsonb,
	"links" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "synop_observations" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "synop_observations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"station_id" text NOT NULL,
	"station_name" text,
	"obs_datetime_utc" timestamp with time zone NOT NULL,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taf_forecasts" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "taf_forecasts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"aerodrome_icao" text NOT NULL,
	"issue_datetime_utc" timestamp with time zone NOT NULL,
	"valid_from" timestamp with time zone NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"raw_tac" text,
	"body" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cap_alerts" ADD CONSTRAINT "cap_alerts_bundle_id_cap_bundles_id_fk" FOREIGN KEY ("bundle_id") REFERENCES "public"."cap_bundles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cap_alerts" ADD CONSTRAINT "cap_alerts_ibf_assessment_id_ibf_assessments_ibf_assessment_id_fk" FOREIGN KEY ("ibf_assessment_id") REFERENCES "public"."ibf_assessments"("ibf_assessment_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cap_bundles" ADD CONSTRAINT "cap_bundles_suite_id_product_suites_suite_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."product_suites"("suite_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evening_products" ADD CONSTRAINT "evening_products_product_ref_products_id_fk" FOREIGN KEY ("product_ref") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hourly_summaries" ADD CONSTRAINT "hourly_summaries_source_metar_id_aviation_observations_id_fk" FOREIGN KEY ("source_metar_id") REFERENCES "public"."aviation_observations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hourly_summaries" ADD CONSTRAINT "hourly_summaries_source_synop_id_synop_observations_id_fk" FOREIGN KEY ("source_synop_id") REFERENCES "public"."synop_observations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ibf_assessments" ADD CONSTRAINT "ibf_assessments_product_id_products_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("product_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marine_products" ADD CONSTRAINT "marine_products_product_ref_products_id_fk" FOREIGN KEY ("product_ref") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "midday_products" ADD CONSTRAINT "midday_products_product_ref_products_id_fk" FOREIGN KEY ("product_ref") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "morning_products" ADD CONSTRAINT "morning_products_product_ref_products_id_fk" FOREIGN KEY ("product_ref") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tropical_outlook_products" ADD CONSTRAINT "tropical_outlook_products_product_ref_products_id_fk" FOREIGN KEY ("product_ref") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_suite_id_product_suites_suite_id_fk" FOREIGN KEY ("suite_id") REFERENCES "public"."product_suites"("suite_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cap_alerts_alert_id_idx" ON "cap_alerts" USING btree ("cap_alert_id");--> statement-breakpoint
CREATE INDEX "cap_alerts_bundle_id_idx" ON "cap_alerts" USING btree ("bundle_id");--> statement-breakpoint
CREATE INDEX "cap_alerts_ibf_assessment_id_idx" ON "cap_alerts" USING btree ("ibf_assessment_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cap_bundles_bundle_id_idx" ON "cap_bundles" USING btree ("cap_bundle_id");--> statement-breakpoint
CREATE INDEX "cap_bundles_suite_id_idx" ON "cap_bundles" USING btree ("suite_id");--> statement-breakpoint
CREATE UNIQUE INDEX "evening_products_product_ref_idx" ON "evening_products" USING btree ("product_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "hourly_summaries_valid_hour_idx" ON "hourly_summaries" USING btree ("valid_hour_utc");--> statement-breakpoint
CREATE INDEX "hourly_summaries_source_type_idx" ON "hourly_summaries" USING btree ("source_type");--> statement-breakpoint
CREATE UNIQUE INDEX "ibf_assessments_assessment_id_idx" ON "ibf_assessments" USING btree ("ibf_assessment_id");--> statement-breakpoint
CREATE INDEX "ibf_assessments_product_id_idx" ON "ibf_assessments" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "marine_products_product_ref_idx" ON "marine_products" USING btree ("product_ref");--> statement-breakpoint
CREATE INDEX "marine_products_color_code_idx" ON "marine_products" USING btree ("color_code");--> statement-breakpoint
CREATE INDEX "aviation_obs_aerodrome_obs_time_idx" ON "aviation_observations" USING btree ("aerodrome_icao","obs_datetime_utc");--> statement-breakpoint
CREATE INDEX "aviation_obs_report_type_idx" ON "aviation_observations" USING btree ("report_type");--> statement-breakpoint
CREATE UNIQUE INDEX "midday_products_product_ref_idx" ON "midday_products" USING btree ("product_ref");--> statement-breakpoint
CREATE INDEX "midday_products_station_name_idx" ON "midday_products" USING btree ("station_name");--> statement-breakpoint
CREATE UNIQUE INDEX "morning_products_product_ref_idx" ON "morning_products" USING btree ("product_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "tropical_outlook_products_product_ref_idx" ON "tropical_outlook_products" USING btree ("product_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "product_suites_suite_id_idx" ON "product_suites" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "product_suites_issue_datetime_idx" ON "product_suites" USING btree ("suite_issue_datetime_utc");--> statement-breakpoint
CREATE UNIQUE INDEX "products_product_id_idx" ON "products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "products_suite_id_idx" ON "products" USING btree ("suite_id");--> statement-breakpoint
CREATE INDEX "products_issue_datetime_idx" ON "products" USING btree ("issue_datetime_utc");--> statement-breakpoint
CREATE INDEX "products_type_idx" ON "products" USING btree ("product_type");--> statement-breakpoint
CREATE INDEX "synop_obs_station_obs_time_idx" ON "synop_observations" USING btree ("station_id","obs_datetime_utc");--> statement-breakpoint
CREATE INDEX "synop_obs_station_id_idx" ON "synop_observations" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "taf_forecasts_aerodrome_idx" ON "taf_forecasts" USING btree ("aerodrome_icao");--> statement-breakpoint
CREATE INDEX "taf_forecasts_validity_idx" ON "taf_forecasts" USING btree ("valid_from","valid_until");--> statement-breakpoint
CREATE INDEX "taf_forecasts_issue_datetime_idx" ON "taf_forecasts" USING btree ("issue_datetime_utc");