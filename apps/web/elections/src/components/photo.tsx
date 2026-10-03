import { cn } from "@barrelsgd/ui/lib/utils";
import Image from "next/image";
import { PHOTOS, type PhotoId } from "@/data/photos";

/**
 * A newspaper photo: square edges, then a caption with the credit and
 * licence. `ratio` is a Tailwind aspect class for the crop.
 */
export function Photo({
  id,
  ratio = "aspect-[3/2]",
  sizes = "(max-width: 768px) 100vw, 640px",
  priority = false,
  className,
}: {
  id: PhotoId;
  ratio?: string;
  sizes?: string;
  priority?: boolean;
  className?: string;
}) {
  const photo = PHOTOS[id];
  return (
    <figure className={cn("m-0 min-w-0", className)}>
      <div className={cn("relative overflow-hidden bg-el-paper-2", ratio)}>
        <Image
          alt={photo.alt}
          className="object-cover"
          fill
          priority={priority}
          sizes={sizes}
          src={photo.src}
        />
      </div>
      <figcaption className="mt-2 text-el-muted text-sm leading-relaxed">
        {photo.caption}{" "}
        <a className="underline underline-offset-2" href={photo.source}>
          {photo.credit}
        </a>
        {" · "}
        {"url" in photo.licence && photo.licence.url ? (
          <a className="underline underline-offset-2" href={photo.licence.url}>
            {photo.licence.label}
          </a>
        ) : (
          photo.licence.label
        )}
      </figcaption>
    </figure>
  );
}
