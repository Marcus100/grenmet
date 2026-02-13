'use client';

import { useState } from 'react';
import { WeatherImage } from '@/db/schema';
import { ImagesBySynoptic } from '@/db/queries';
import { ImageRow } from './ImageRow';
import { Lightbox } from './Lightbox';

interface GalleryProps {
  imagesBySynoptic: ImagesBySynoptic;
}

export function Gallery({ imagesBySynoptic }: GalleryProps) {
  const [selectedImage, setSelectedImage] = useState<WeatherImage | null>(null);

  if (imagesBySynoptic.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500">
        <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <p className="text-lg">No images found</p>
        <p className="text-sm mt-1">Run the scrapers to fetch weather images</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {imagesBySynoptic.map((group, index) => (
          <ImageRow
            key={`${group.name}-${index}`}
            title={group.name}
            synopticImages={group.synopticImages}
            onImageClick={setSelectedImage}
          />
        ))}
      </div>

      <Lightbox
        image={selectedImage}
        onClose={() => setSelectedImage(null)}
      />
    </>
  );
}
