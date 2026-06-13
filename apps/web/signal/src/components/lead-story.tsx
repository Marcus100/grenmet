import Image from "next/image";
import Link from "next/link";
import { Eyebrow } from "@/components/eyebrow";

export interface LeadStoryProps {
  dek?: string;
  eyebrow: string;
  heroAlt?: string;
  heroImage?: string;
  href: string;
  meta?: string;
  title: string;
}

export function LeadStory({
  href,
  eyebrow,
  title,
  dek,
  meta,
  heroImage,
  heroAlt,
}: LeadStoryProps) {
  return (
    <article className="flex flex-col gap-4">
      <Link className="group block" href={href}>
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-signal-green/10">
          {heroImage ? (
            <Image
              alt={heroAlt ?? ""}
              className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              fill
              priority
              sizes="(max-width: 768px) 100vw, 640px"
              src={heroImage}
            />
          ) : null}
        </div>
      </Link>
      <div className="flex flex-col gap-2">
        <Eyebrow>{eyebrow}</Eyebrow>
        <Link href={href}>
          <h2 className="font-bold font-serif text-2xl leading-tight tracking-tight hover:text-signal-green sm:text-3xl">
            {title}
          </h2>
        </Link>
        {dek ? <p className="text-signal-muted">{dek}</p> : null}
        {meta ? (
          <p className="text-[0.7rem] text-signal-muted uppercase tracking-wide">
            {meta}
          </p>
        ) : null}
      </div>
    </article>
  );
}
