import type { BookingGalleryImage } from "@barrelsgd/api-client";
import { CoverPhoto } from "@/components/cover-photo";
import { safeImageUrl } from "@/lib/storefront-brand";

/**
 * The business's photographs of its work, as one horizontally scrolling strip
 * above the services. Each photograph is decorative (`CoverPhoto` gives it an
 * empty alt, hides it from assistive technology, loads it lazily and removes
 * itself if it fails), so the heading carries the meaning.
 *
 * Only an https address is shown (`safeImageUrl`), and the section renders
 * nothing at all when the business has no safe photograph. The strip scrolls
 * inside itself: `overflow-x-auto` with a `min-w-0` track, so a wide row never
 * makes the page scroll sideways.
 */
export function GalleryStrip({
  images,
}: {
  images: readonly BookingGalleryImage[];
}) {
  const photos = images
    .map((image) => ({ id: image.id, src: safeImageUrl(image.url) }))
    .filter(
      (photo): photo is { id: string; src: string } => photo.src !== null
    );
  if (photos.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="gallery-title" className="min-w-0 space-y-3">
      <h2 className="text-lg font-semibold" id="gallery-title">
        Our work
      </h2>
      <ul className="rail flex min-w-0 snap-x snap-mandatory gap-4 overflow-x-auto pb-2">
        {photos.map((photo) => (
          <li className="shrink-0 snap-start" key={photo.id}>
            <CoverPhoto
              className="relative aspect-[4/5] w-40 rounded-xl sm:w-48"
              src={photo.src}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
