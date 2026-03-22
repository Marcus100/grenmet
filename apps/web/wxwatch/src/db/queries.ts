import "server-only";

import { and, asc, gte, isNotNull, lt } from "drizzle-orm";
import { getSynopticHour, roundToSynopticTime } from "../../lib/utils";
import { db } from "../index";
import { type WeatherImage, weatherImages } from "./schema";

export type ImagesByName = {
  name: string;
  images: WeatherImage[]; // sorted by fetched_at ASC (oldest first)
}[];

const TIMESTAMP_PREFIX_REGEX = /^\d+_(.+)$/;

/**
 * Extract the base image name by removing the source timestamp prefix.
 * e.g., "20253391656_GOES19-GLM-taw-EXTENT3-7200x4320.jpg" -> "GOES19-GLM-taw-EXTENT3-7200x4320.jpg"
 */
function getBaseName(name: string): string {
  const match = name.match(TIMESTAMP_PREFIX_REGEX);
  return match ? match[1] : name;
}

/**
 * Fetch all images from the database, grouped by base image name.
 * Each group contains the same image type fetched at different times,
 * sorted by fetched_at ASC (oldest first).
 */
export async function getImagesGroupedByName(): Promise<ImagesByName> {
  const images = await db
    .select()
    .from(weatherImages)
    .orderBy(asc(weatherImages.fetchedAt));

  // Group by base image name (without source timestamp prefix)
  const nameMap = new Map<string, WeatherImage[]>();

  for (const img of images) {
    const rawName = img.name || "unknown";
    const baseName = getBaseName(rawName);

    if (!nameMap.has(baseName)) {
      nameMap.set(baseName, []);
    }
    nameMap.get(baseName)?.push(img);
  }

  // Convert to array and sort by name alphabetically
  return Array.from(nameMap.entries())
    .map(([name, images]) => ({ name, images }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type ImagesBySynoptic = {
  name: string;
  synopticImages: {
    "12": WeatherImage | null;
    "15": WeatherImage | null;
    "18": WeatherImage | null;
    "21": WeatherImage | null;
    "00": WeatherImage | null;
    "03": WeatherImage | null;
    "06": WeatherImage | null;
    "09": WeatherImage | null;
  };
}[];

/**
 * Synoptic hours in display order
 */
const SYNOPTIC_HOURS = [
  "00",
  "03",
  "06",
  "09",
  "12",
  "15",
  "18",
  "21",
] as const;
type SynopticHour = (typeof SYNOPTIC_HOURS)[number];

function findClosestToTarget(
  images: WeatherImage[],
  targetTime: Date
): WeatherImage {
  let closest = images[0];
  let minDiff = Math.abs(
    new Date(closest.observationTime ?? 0).getTime() - targetTime.getTime()
  );
  for (let i = 1; i < images.length; i++) {
    const diff = Math.abs(
      new Date(images[i].observationTime ?? 0).getTime() - targetTime.getTime()
    );
    if (diff < minDiff) {
      minDiff = diff;
      closest = images[i];
    }
  }
  return closest;
}

function selectMostRecent(images: WeatherImage[]): WeatherImage {
  return images.reduce((latest, current) => {
    const latestTime = new Date(latest.fetchedAt || 0).getTime();
    const currentTime = new Date(current.fetchedAt || 0).getTime();
    return currentTime > latestTime ? current : latest;
  });
}

function selectImageForHour(
  imagesAtHour: WeatherImage[],
  hour: SynopticHour,
  startOfDay: Date,
  isGoes19: boolean
): WeatherImage | null {
  if (imagesAtHour.length === 0) return null;
  if (imagesAtHour.length === 1) return imagesAtHour[0];

  if (isGoes19) {
    const synopticHourNum = Number.parseInt(hour, 10);
    const targetTime = new Date(
      Date.UTC(
        startOfDay.getUTCFullYear(),
        startOfDay.getUTCMonth(),
        startOfDay.getUTCDate(),
        synopticHourNum,
        0,
        0,
        0
      )
    );
    return findClosestToTarget(imagesAtHour, targetTime);
  }

  return selectMostRecent(imagesAtHour);
}

function buildSynopticImages(
  synopticMap: Map<SynopticHour, WeatherImage[]>,
  startOfDay: Date,
  isGoes19: boolean
): ImagesBySynoptic[0]["synopticImages"] {
  const result: ImagesBySynoptic[0]["synopticImages"] = {
    "12": null,
    "15": null,
    "18": null,
    "21": null,
    "00": null,
    "03": null,
    "06": null,
    "09": null,
  };
  for (const hour of SYNOPTIC_HOURS) {
    result[hour] = selectImageForHour(
      synopticMap.get(hour) ?? [],
      hour,
      startOfDay,
      isGoes19
    );
  }
  return result;
}

/**
 * Fetch images for a specific date, grouped by name and organized by synoptic times.
 *
 * @param date - Date in UTC (time portion ignored, uses date only)
 * @returns Array of image groups, each with 8 synoptic time slots
 */
export async function getImagesByDateAndSynoptic(
  date: Date
): Promise<ImagesBySynoptic> {
  const startOfDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
  const endOfDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1)
  );

  const images = await db
    .select()
    .from(weatherImages)
    .where(
      and(
        isNotNull(weatherImages.observationTime),
        gte(weatherImages.observationTime, startOfDay),
        lt(weatherImages.observationTime, endOfDay)
      )
    )
    .orderBy(asc(weatherImages.observationTime));

  const imageGroups = new Map<string, Map<SynopticHour, WeatherImage[]>>();

  for (const img of images) {
    if (!(img.observationTime && img.name)) continue;

    const obsDate = new Date(img.observationTime);
    const rounded = roundToSynopticTime(obsDate);
    const synopticHour = getSynopticHour(rounded) as SynopticHour;

    if (!SYNOPTIC_HOURS.includes(synopticHour)) continue;

    const name = img.spiderName === "goes19" ? getBaseName(img.name) : img.name;

    if (!imageGroups.has(name)) {
      imageGroups.set(name, new Map());
    }
    const synopticMap = imageGroups.get(name);
    if (!synopticMap) continue;
    if (!synopticMap.has(synopticHour)) {
      synopticMap.set(synopticHour, []);
    }
    synopticMap.get(synopticHour)?.push(img);
  }

  const result: ImagesBySynoptic = [];

  for (const [name, synopticMap] of imageGroups.entries()) {
    const firstImage = Array.from(synopticMap.values())
      .flat()
      .find((img) => img !== null);
    const isGoes19 = firstImage?.spiderName === "goes19";

    result.push({
      name,
      synopticImages: buildSynopticImages(synopticMap, startOfDay, isGoes19),
    });
  }

  return result.sort((a, b) => a.name.localeCompare(b.name));
}
