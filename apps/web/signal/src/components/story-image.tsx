import { cn } from "@barrelsgd/ui/lib/utils";
import Image from "next/image";
import { STORY_IMAGES } from "@/lib/story-images";

export function StoryImage({
  article,
  compact = false,
  wide = false,
  priority = false,
  className,
}: {
  article: { section: string; slug: string };
  compact?: boolean;
  wide?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const image = STORY_IMAGES[`${article.section}/${article.slug}`];
  if (!image) return null;
  return (
    <figure className={cn("mb-5", compact && "max-w-56", className)}>
      <div
        className={cn(
          "relative overflow-hidden",
          compact || wide ? "aspect-[2/1]" : "aspect-[3/2]"
        )}
      >
        <Image
          alt={image.alt}
          className="object-cover"
          fill
          priority={priority}
          sizes={compact ? "224px" : "(max-width: 768px) 100vw, 640px"}
          src={image.src}
        />
      </div>
      <figcaption className="mt-2 text-signal-muted text-xs leading-relaxed">
        {image.caption}{" "}
        <a className="underline underline-offset-2" href={image.source}>
          {image.credit}
        </a>
        {image.license ? (
          <>
            {" "}
            ·{" "}
            <a
              className="underline underline-offset-2"
              href={image.license.url}
            >
              {image.license.label}
            </a>
          </>
        ) : null}
      </figcaption>
    </figure>
  );
}
