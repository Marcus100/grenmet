import {
  serial,
  text,
  timestamp,
  pgTable,
  integer,
  boolean,
  bigint,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

export const weatherImages = pgTable(
  "weather_images",
  {
    id: serial("id").primaryKey(),
    storagePath: text("storage_path").notNull(),
    width: integer("width").default(0),
    height: integer("height").default(0),
    spiderName: text("spider_name"),
    fileFormat: text("file_format"),
    isAnimated: boolean("is_animated").default(false),
    fileSizeBytes: bigint("file_size_bytes", { mode: "number" }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    name: text("name"),
    imageUrl: text("image_url"),
    parentUrl: text("parent_url"),
    pageTitle: text("page_title"),
    sourceModified: timestamp("source_modified", { withTimezone: true }),
    observationTime: timestamp("observation_time", { withTimezone: true }),
    etag: text("etag"),
    checksum: text("checksum"),
    downloadStatus: text("download_status"),
    mode: text("mode"),
    frameCount: integer("frame_count").default(1),
    rawMetadata: jsonb("raw_metadata").default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [
    index("idx_observation_time").on(table.observationTime),
    index("idx_spider_fetched").on(table.spiderName, table.fetchedAt),
    index("idx_fetched_at").on(table.fetchedAt),
    index("idx_url_checksum").on(table.imageUrl, table.checksum),
  ]
);

export type WeatherImage = typeof weatherImages.$inferSelect;