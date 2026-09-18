CREATE TABLE "weather_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"storage_path" text NOT NULL,
	"width" integer DEFAULT 0,
	"height" integer DEFAULT 0,
	"spider_name" text,
	"file_format" text,
	"is_animated" boolean DEFAULT false,
	"file_size_bytes" bigint,
	"fetched_at" timestamp with time zone NOT NULL,
	"name" text,
	"image_url" text,
	"parent_url" text,
	"page_title" text,
	"source_modified" timestamp with time zone,
	"observation_time" timestamp with time zone,
	"etag" text,
	"checksum" text,
	"download_status" text,
	"mode" text,
	"frame_count" integer DEFAULT 1,
	"raw_metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX "idx_observation_time" ON "weather_images" USING btree ("observation_time");--> statement-breakpoint
CREATE INDEX "idx_spider_fetched" ON "weather_images" USING btree ("spider_name","fetched_at");--> statement-breakpoint
CREATE INDEX "idx_fetched_at" ON "weather_images" USING btree ("fetched_at");--> statement-breakpoint
CREATE INDEX "idx_url_checksum" ON "weather_images" USING btree ("image_url","checksum");