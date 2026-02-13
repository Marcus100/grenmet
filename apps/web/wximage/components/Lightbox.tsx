'use client';

import { useEffect, useCallback } from 'react';
import Image from 'next/image';
import { WeatherImage } from '@/db/schema';
import { getImageUrl } from '@/lib/utils';

interface LightboxProps {
  image: WeatherImage | null;
  onClose: () => void;
}

export function Lightbox({ image, onClose }: LightboxProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  }, [onClose]);

  useEffect(() => {
    if (image) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [image, handleKeyDown]);

  if (!image) return null;

  const imageUrl = getImageUrl(image.storagePath);
  const fetchedDate = image.fetchedAt ? new Date(image.fetchedAt).toLocaleString() : 'Unknown';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        aria-label="Close lightbox"
      >
        <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Content container */}
      <div
        className="relative max-w-[90vw] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Image */}
        <div className="relative flex-1 flex items-center justify-center">
          <Image
            src={imageUrl}
            alt={image.name || 'Weather image'}
            width={image.width || 800}
            height={image.height || 600}
            className="max-w-full max-h-[80vh] object-contain rounded-lg"
            unoptimized={image.fileFormat === 'gif'}
            priority
          />
        </div>

        {/* Metadata panel */}
        <div className="mt-4 p-4 bg-white/10 backdrop-blur rounded-lg text-white">
          <h3 className="text-lg font-semibold mb-2">{image.name || 'Untitled'}</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Spider:</span>
              <p className="capitalize">{image.spiderName?.replace(/_/g, ' ') || 'Unknown'}</p>
            </div>
            <div>
              <span className="text-gray-400">Dimensions:</span>
              <p>{image.width || '?'} × {image.height || '?'}</p>
            </div>
            <div>
              <span className="text-gray-400">Format:</span>
              <p className="uppercase">{image.fileFormat || 'Unknown'}</p>
            </div>
            <div>
              <span className="text-gray-400">Fetched:</span>
              <p>{fetchedDate}</p>
            </div>
          </div>
          {image.isAnimated && (
            <p className="mt-2 text-sm text-blue-300">
              Animated ({image.frameCount || '?'} frames)
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
