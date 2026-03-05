import { WeatherImage } from '@/src/db/schema';

export type ImagesByName = {
  name: string;
  images: WeatherImage[];  // sorted by fetched_at DESC (newest first)
}[];
