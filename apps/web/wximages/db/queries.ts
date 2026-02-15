import 'server-only';

import { db } from './index';
import { weatherImages, WeatherImage } from './schema';
import { asc, gte, lt, and, isNotNull } from 'drizzle-orm';
import { roundToSynopticTime, getSynopticHour } from '@/lib/utils';

export type ImagesByName = {
  name: string;
  images: WeatherImage[];  // sorted by fetched_at ASC (oldest first)
}[];

/**
 * Extract the base image name by removing the source timestamp prefix.
 * e.g., "20253391656_GOES19-GLM-taw-EXTENT3-7200x4320.jpg" -> "GOES19-GLM-taw-EXTENT3-7200x4320.jpg"
 */
function getBaseName(name: string): string {
  // Pattern: digits followed by underscore at the start
  // e.g., "20253391656_filename.jpg" -> "filename.jpg"
  const match = name.match(/^\d+_(.+)$/);
  return match ? match[1] : name;
}

/**
 * Fetch all images from the database, grouped by base image name.
 * Each group contains the same image type fetched at different times,
 * sorted by fetched_at ASC (oldest first).
 */
export async function getImagesGroupedByName(): Promise<ImagesByName> {
  const images = await db.select()
    .from(weatherImages)
    .orderBy(asc(weatherImages.fetchedAt));
  
  // Group by base image name (without source timestamp prefix)
  const nameMap = new Map<string, WeatherImage[]>();
  
  for (const img of images) {
    const rawName = img.name || 'unknown';
    const baseName = getBaseName(rawName);
    
    if (!nameMap.has(baseName)) {
      nameMap.set(baseName, []);
    }
    nameMap.get(baseName)!.push(img);
  }
  
  // Convert to array and sort by name alphabetically
  return Array.from(nameMap.entries())
    .map(([name, images]) => ({ name, images }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export type ImagesBySynoptic = {
  name: string;
  synopticImages: {
    '12': WeatherImage | null;
    '15': WeatherImage | null;
    '18': WeatherImage | null;
    '21': WeatherImage | null;
    '00': WeatherImage | null;
    '03': WeatherImage | null;
    '06': WeatherImage | null;
    '09': WeatherImage | null;
  };
}[];

/**
 * Synoptic hours in display order: 12z, 15z, 18z, 21z, 00z, 03z, 06z, 09z
 */
const SYNOPTIC_HOURS = ['00', '03', '06', '09', '12', '15', '18', '21'] as const;
type SynopticHour = typeof SYNOPTIC_HOURS[number];

/**
 * Fetch images for a specific date, grouped by name and organized by synoptic times.
 * Each image's observation_time is rounded to the nearest synoptic time.
 * 
 * For GOES19 images: Only the image with observation_time closest to each synoptic hour
 * is displayed (grouped by base name without timestamp prefix).
 * 
 * For other images: Only one image per synoptic hour is displayed (most recent by fetched_at).
 * 
 * @param date - Date in UTC (time portion ignored, uses date only)
 * @returns Array of image groups, each with 8 synoptic time slots
 */
export async function getImagesByDateAndSynoptic(date: Date): Promise<ImagesBySynoptic> {
  // Get start and end of day in UTC
  const startOfDay = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    0, 0, 0, 0
  ));
  const endOfDay = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() + 1,
    0, 0, 0, 0
  ));

  // Query images for this date (where observation_time falls within the day)
  const images = await db.select()
    .from(weatherImages)
    .where(
      and(
        isNotNull(weatherImages.observationTime),
        gte(weatherImages.observationTime, startOfDay),
        lt(weatherImages.observationTime, endOfDay)
      )
    )
    .orderBy(asc(weatherImages.observationTime));

  // Process images: round to synoptic time and group
  // We need to handle multiple images at same synoptic time for same name
  // by creating separate rows
  
  // First, group by (name, rounded synoptic time)
  // This allows us to create separate rows when needed
  const imageGroups = new Map<string, Map<SynopticHour, WeatherImage[]>>();

  for (const img of images) {
    if (!img.observationTime || !img.name) continue;

    const obsDate = new Date(img.observationTime);
    const rounded = roundToSynopticTime(obsDate);
    const synopticHour = getSynopticHour(rounded) as SynopticHour;

    if (!SYNOPTIC_HOURS.includes(synopticHour)) continue;

    // For GOES19 images, use base name (without timestamp prefix) for grouping
    // For other images, use full name
    const name = img.spiderName === 'goes19' ? getBaseName(img.name) : img.name;

    if (!imageGroups.has(name)) {
      imageGroups.set(name, new Map());
    }

    const synopticMap = imageGroups.get(name)!;
    if (!synopticMap.has(synopticHour)) {
      synopticMap.set(synopticHour, []);
    }

    synopticMap.get(synopticHour)!.push(img);
  }

  // Now create rows: for each name, create rows based on combinations
  // For GOES19 images, select closest to synoptic hour; for others, create separate rows
  const result: ImagesBySynoptic = [];

  for (const [name, synopticMap] of imageGroups.entries()) {
    // Check if this is a GOES19 image group (by checking first image's spiderName)
    const firstImage = Array.from(synopticMap.values())
      .flat()
      .find(img => img !== null);
    const isGoes19 = firstImage?.spiderName === 'goes19';

    if (isGoes19) {
      // For GOES19, select the image closest to each synoptic hour
      const synopticImages: ImagesBySynoptic[0]['synopticImages'] = {
        '12': null,
        '15': null,
        '18': null,
        '21': null,
        '00': null,
        '03': null,
        '06': null,
        '09': null,
      };

      // Fill in images for each synoptic hour
      for (const hour of SYNOPTIC_HOURS) {
        const imagesAtHour = synopticMap.get(hour) || [];
        
        if (imagesAtHour.length === 0) {
          synopticImages[hour] = null;
        } else if (imagesAtHour.length === 1) {
          synopticImages[hour] = imagesAtHour[0];
        } else {
          // Select the image with observation_time closest to synoptic hour
          const synopticHourNum = parseInt(hour);
          const targetTime = new Date(Date.UTC(
            startOfDay.getUTCFullYear(),
            startOfDay.getUTCMonth(),
            startOfDay.getUTCDate(),
            synopticHourNum,
            0,
            0,
            0
          ));

          // Find image with observation_time closest to target synoptic hour
          let closestImage = imagesAtHour[0];
          let minDiff = Math.abs(
            new Date(closestImage.observationTime!).getTime() - targetTime.getTime()
          );

          for (let i = 1; i < imagesAtHour.length; i++) {
            const img = imagesAtHour[i];
            const diff = Math.abs(
              new Date(img.observationTime!).getTime() - targetTime.getTime()
            );
            if (diff < minDiff) {
              minDiff = diff;
              closestImage = img;
            }
          }

          synopticImages[hour] = closestImage;
        }
      }

      result.push({
        name,
        synopticImages,
      });
    } else {
      // For non-GOES19 images, select one image per synoptic hour (most recent by fetched_at)
      const synopticImages: ImagesBySynoptic[0]['synopticImages'] = {
        '12': null,
        '15': null,
        '18': null,
        '21': null,
        '00': null,
        '03': null,
        '06': null,
        '09': null,
      };

      // Fill in images for each synoptic hour
      for (const hour of SYNOPTIC_HOURS) {
        const imagesAtHour = synopticMap.get(hour) || [];
        
        if (imagesAtHour.length === 0) {
          synopticImages[hour] = null;
        } else if (imagesAtHour.length === 1) {
          synopticImages[hour] = imagesAtHour[0];
        } else {
          // Select the most recent image (by fetched_at) for this synoptic hour
          const mostRecent = imagesAtHour.reduce((latest, current) => {
            const latestTime = new Date(latest.fetchedAt || 0).getTime();
            const currentTime = new Date(current.fetchedAt || 0).getTime();
            return currentTime > latestTime ? current : latest;
          });
          synopticImages[hour] = mostRecent;
        }
      }

      result.push({
        name,
        synopticImages,
      });
    }
  }

  // Sort rows by name alphabetically
  return result.sort((a, b) => a.name.localeCompare(b.name));
}
