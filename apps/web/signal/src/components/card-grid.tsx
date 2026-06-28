import Image from "next/image";
import Link from "next/link";
import { Eyebrow } from "@/components/eyebrow";

export interface CardItem {
  alt: string;
  eyebrow: string;
  href: string;
  image: string;
  title: string;
}

export function CardGrid({ items }: { items: CardItem[] }) {
  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
      {items.map((item) => (
        <article className="flex flex-col gap-2" key={item.href}>
          <Link className="group block" href={item.href}>
            <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-signal-green/10">
              <Image
                alt={item.alt}
                className="object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                fill
                sizes="(max-width: 640px) 100vw, 320px"
                src={item.image}
              />
            </div>
          </Link>
          <Eyebrow>{item.eyebrow}</Eyebrow>
          <Link href={item.href}>
            <h3 className="font-semibold font-serif text-lg leading-snug hover:text-signal-green">
              {item.title}
            </h3>
          </Link>
        </article>
      ))}
    </div>
  );
}
