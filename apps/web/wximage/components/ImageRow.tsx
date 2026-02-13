'use client';

import Image from 'next/image';
import { WeatherImage } from '@/db/schema';
import { getImageUrl } from '@/lib/utils';

interface ImageRowProps {
  title: string;
  synopticImages: {
    '00': WeatherImage | null;
    '03': WeatherImage | null;
    '06': WeatherImage | null;
    '09': WeatherImage | null;
    '12': WeatherImage | null;
    '15': WeatherImage | null;
    '18': WeatherImage | null;
    '21': WeatherImage | null;
  };
  onImageClick: (image: WeatherImage) => void;
}

const SYNOPTIC_HOURS: Array<'00' | '03' | '06' | '09' | '12' | '15' | '18' | '21'> = [
  '00',
  '03',
  '06',
  '09',
  '12',
  '15',
  '18',
  '21',
];

export function ImageRow({ title, synopticImages, onImageClick }: ImageRowProps) {
  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3 px-4">
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      </div>

      {/* 8-image grid */}
      <div className="grid grid-cols-8 gap-3 px-4">
        {SYNOPTIC_HOURS.map((hour) => {
          const image = synopticImages[hour];
          return (
            <SynopticImageSlot
              key={hour}
              hour={hour}
              image={image}
              onImageClick={onImageClick}
            />
          );
        })}
      </div>
    </section>
  );
}

interface SynopticImageSlotProps {
  hour: string;
  image: WeatherImage | null;
  onImageClick: (image: WeatherImage) => void;
}

function SynopticImageSlot({ hour, image, onImageClick }: SynopticImageSlotProps) {
  if (!image) {
    return (
      <div className="relative aspect-[4/3] rounded-lg bg-gray-200 border-2 border-dashed border-gray-300 flex items-center justify-center">
        <div className="text-center">
          <p className="text-xs font-medium text-gray-400 mb-1">{hour}z</p>
          <p className="text-xs text-gray-400">No image</p>
        </div>
      </div>
    );
  }

  const imageUrl = getImageUrl(image.storagePath);

  const observationTime = image.observationTime
    ? new Date(image.observationTime).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
        hour12: false,
      }) + ' UTC'
    : 'Unknown';

  return (
    <button
      onClick={() => onImageClick(image)}
      className="relative aspect-[4/3] group overflow-hidden rounded-lg bg-gray-100 hover:ring-2 hover:ring-blue-500 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <Image
        src={imageUrl}
        alt={image.name || `Weather image at ${hour}z`}
        fill
        className="object-cover group-hover:scale-105 transition-transform duration-200"
        sizes="(max-width: 768px) 50vw, (max-width: 1200px) 25vw, 12.5vw"
        unoptimized={image.fileFormat === 'gif'}
      />
      {/* Time label overlay */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2">
        <p className="text-white text-xs font-medium">{hour}z</p>
        <p className="text-white text-[10px] opacity-90">{observationTime}</p>
      </div>
    </button>
  );
}
