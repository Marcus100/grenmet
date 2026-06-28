import { PlayCircle } from "lucide-react";
import Image from "next/image";

interface WatchItem {
  date: string;
  thumbnail: string;
  title: string;
}

const SAMPLE_ITEMS: WatchItem[] = [
  {
    title: "What is a tropical wave? Explained in 60 seconds",
    date: "Jun 12, 2026",
    thumbnail: "/images/placeholder-green.svg",
  },
  {
    title: "How a bill becomes law in Grenada",
    date: "Jun 10, 2026",
    thumbnail: "/images/placeholder-gold.svg",
  },
  {
    title: "Spotting a fake WhatsApp screenshot",
    date: "Jun 9, 2026",
    thumbnail: "/images/placeholder-ink.svg",
  },
];

export function WatchBlock() {
  return (
    <ul className="flex flex-col">
      {SAMPLE_ITEMS.map((item) => (
        <li
          className="flex items-center gap-4 border-signal-rule border-b py-3 first:pt-0 last:border-b-0"
          key={item.title}
        >
          <div className="relative aspect-video w-28 shrink-0 overflow-hidden rounded-md bg-signal-green/10">
            <Image
              alt=""
              className="object-cover"
              fill
              sizes="112px"
              src={item.thumbnail}
            />
            <PlayCircle className="absolute top-1/2 left-1/2 size-7 -translate-x-1/2 -translate-y-1/2 text-white/90" />
          </div>
          <div className="min-w-0">
            <p className="font-medium font-serif text-sm leading-snug">
              {item.title}
            </p>
            <p className="mt-1 text-[0.7rem] text-signal-muted uppercase tracking-wide">
              Watch now · {item.date}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}
