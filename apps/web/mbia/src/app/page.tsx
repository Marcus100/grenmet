import { Button } from "@grenmet/ui/components/ui/button";
import {
  Armchair,
  ArrowRight,
  CarFront,
  PlaneLanding,
  PlaneTakeoff,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { FlightBoard } from "@/components/flight-board";
import { getNews } from "@/lib/content";
import { formatDate } from "@/lib/content-utils";
import { SAMPLE_FLIGHTS } from "@/lib/flights";
import { QUICK_TASKS } from "@/lib/nav";

const QUICK_TASK_ICONS = [PlaneLanding, PlaneTakeoff, CarFront, Armchair];

const AIRPORT_CARDS = [
  {
    href: "/airports/mbia",
    code: "GND",
    name: "Maurice Bishop International Airport",
    blurb:
      "Grenada's international gateway at Point Salines — direct connections to North America, the UK and the Caribbean.",
    image: "/images/mbia-terminal-sea.jpg",
    alt: "Maurice Bishop International Airport terminal with the Caribbean Sea beyond",
  },
  {
    href: "/airports/lauriston",
    code: "CRU",
    name: "Lauriston Airport, Carriacou",
    blurb:
      "Your passage to paradise — the regional hub linking Carriacou and Petite Martinique with Grenada and beyond.",
    image: "/images/lauriston.jpg",
    alt: "Lauriston Airport runway beside the sea on Carriacou",
  },
  {
    href: "/airports/pearls",
    code: "Historic",
    name: "Pearls Airport",
    blurb:
      "Grenada's first airport, near Grenville — no longer in operation, but a living piece of our aviation history.",
    image: "/images/pearls.jpg",
    alt: "The historic Pearls Airport site with remnants of old aircraft",
  },
] as const;

const EXPERIENCE_CARDS = [
  {
    href: "/at-the-airport/dine",
    title: "Dine",
    blurb: "Local flavours and casual bites before you board.",
    image: "/images/dining.jpg",
    alt: "Café seating at Maurice Bishop International Airport",
  },
  {
    href: "/at-the-airport/shopping",
    title: "Shop",
    blurb: "Duty-free, spices, crafts and last-minute gifts.",
    image: "/images/shopping.jpg",
    alt: "Duty-free shopping hall at MBIA",
  },
  {
    href: "/at-the-airport/airport-lounges",
    title: "Relax",
    blurb: "Executive, VIP diplomatic and jet-centre lounges.",
    image: "/images/departure-lounge.jpg",
    alt: "Departure lounge seating at MBIA",
  },
] as const;

const AIRLINES = [
  ["American-Airlines", "American Airlines"],
  ["JetBlue-Airways", "JetBlue"],
  ["virgin-atlantic", "Virgin Atlantic"],
  ["British-Airways", "British Airways"],
  ["Air-Canada", "Air Canada"],
  ["WestJet", "WestJet"],
  ["Caribbean-Airlines", "Caribbean Airlines"],
  ["InterCaribbean-Airways", "interCaribbean Airways"],
  ["Sunrise-Airways", "Sunrise Airways"],
  ["flysvg-Air", "SVG Air"],
  ["Liat-Air", "LIAT"],
] as const;

function Hero() {
  return (
    <div className="relative isolate overflow-hidden bg-gaa-navy-ink">
      <Image
        alt="Aerial view of Maurice Bishop International Airport between the hills and the Caribbean Sea"
        className="absolute inset-0 size-full object-cover"
        fill
        priority
        sizes="100vw"
        src="/images/hero-mbia-aerial.jpg"
      />
      <div className="absolute inset-0 bg-linear-to-t from-gaa-navy-ink via-gaa-navy-ink/60 to-gaa-navy-ink/20" />
      <div className="relative mx-auto flex min-h-[70vh] max-w-7xl flex-col justify-end px-4 pt-32 pb-40 lg:px-8">
        <p className="font-semibold text-gaa-gold text-xs uppercase tracking-[0.25em] sm:text-sm">
          Grenada Airports Authority
        </p>
        <h1 className="mt-4 max-w-3xl font-bold font-display text-4xl text-white leading-[1.05] sm:text-5xl lg:text-6xl">
          Gateway to the Spice of the Caribbean
        </h1>
        <p className="mt-5 max-w-xl text-lg text-white/80 leading-relaxed">
          Connecting you to Grenada, Carriacou &amp; Petite Martinique — and the
          world beyond.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <Button
            asChild
            className="bg-gaa-gold font-semibold text-gaa-navy-ink hover:bg-gaa-gold-deep"
            size="lg"
          >
            <Link href="/flights">
              <PlaneTakeoff aria-hidden="true" className="size-4" />
              Flight Information
            </Link>
          </Button>
          <Button
            asChild
            className="border-white/40 bg-white/10 text-white backdrop-blur hover:bg-white/20"
            size="lg"
            variant="outline"
          >
            <Link href="/travel">Plan Your Travel</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

function QuickTasks() {
  return (
    <div className="mx-auto grid max-w-7xl gap-4 px-4 sm:grid-cols-2 lg:grid-cols-4 lg:px-8">
      {QUICK_TASKS.map((task, i) => {
        const Icon = QUICK_TASK_ICONS[i] ?? ArrowRight;
        return (
          <Link
            className="group flex items-start gap-4 rounded-2xl border border-gaa-rule bg-white p-5 transition-all hover:-translate-y-0.5 hover:border-gaa-sea/40 hover:shadow-lg"
            href={task.href}
            key={task.href}
          >
            <span className="rounded-xl bg-gaa-mist p-3 text-gaa-navy transition-colors group-hover:bg-gaa-navy group-hover:text-white">
              <Icon aria-hidden="true" className="size-5" />
            </span>
            <span>
              <span className="block font-display font-semibold text-gaa-navy">
                {task.label}
              </span>
              <span className="mt-1 block text-gaa-muted text-sm leading-snug">
                {task.description}
              </span>
            </span>
          </Link>
        );
      })}
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  href,
  linkLabel,
}: {
  eyebrow: string;
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-semibold text-gaa-sea text-xs uppercase tracking-[0.2em]">
          {eyebrow}
        </p>
        <h2 className="mt-2 font-bold font-display text-3xl text-gaa-navy sm:text-4xl">
          {title}
        </h2>
        <div className="mt-4 h-1 w-16 rounded-full bg-gaa-gold" />
      </div>
      {href && linkLabel ? (
        <Link
          className="flex items-center gap-1.5 font-medium text-gaa-sea text-sm hover:text-gaa-navy"
          href={href}
        >
          {linkLabel}
          <ArrowRight aria-hidden="true" className="size-4" />
        </Link>
      ) : null}
    </div>
  );
}

function Airports() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
      <SectionHeading
        eyebrow="Our Airports"
        title="Three airports, one story"
      />
      <div className="grid gap-6 md:grid-cols-3">
        {AIRPORT_CARDS.map((airport) => (
          <Link
            className="group overflow-hidden rounded-2xl border border-gaa-rule bg-white transition-all hover:-translate-y-1 hover:shadow-xl"
            href={airport.href}
            key={airport.href}
          >
            <div className="relative aspect-[3/2] overflow-hidden">
              <Image
                alt={airport.alt}
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                fill
                sizes="(min-width: 768px) 33vw, 100vw"
                src={airport.image}
              />
              <span className="absolute top-4 left-4 rounded-full bg-gaa-navy-ink/85 px-3 py-1 font-semibold text-white text-xs backdrop-blur">
                {airport.code}
              </span>
            </div>
            <div className="p-6">
              <h3 className="font-display font-semibold text-gaa-navy text-lg leading-snug">
                {airport.name}
              </h3>
              <p className="mt-2 text-gaa-muted text-sm leading-relaxed">
                {airport.blurb}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

function Experience() {
  return (
    <section className="bg-gaa-mist">
      <div className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
        <SectionHeading
          eyebrow="At the Airport"
          href="/at-the-airport"
          linkLabel="Everything at the airport"
          title="Arrive early, enjoy it"
        />
        <div className="grid gap-6 md:grid-cols-3">
          {EXPERIENCE_CARDS.map((card) => (
            <Link
              className="group relative aspect-[4/3] overflow-hidden rounded-2xl"
              href={card.href}
              key={card.href}
            >
              <Image
                alt={card.alt}
                className="object-cover transition-transform duration-500 group-hover:scale-105"
                fill
                sizes="(min-width: 768px) 33vw, 100vw"
                src={card.image}
              />
              <div className="absolute inset-0 bg-linear-to-t from-gaa-navy-ink/90 via-gaa-navy-ink/30 to-transparent" />
              <div className="absolute right-0 bottom-0 left-0 p-6">
                <h3 className="font-bold font-display text-white text-xl">
                  {card.title}
                </h3>
                <p className="mt-1 text-sm text-white/80">{card.blurb}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function Airlines() {
  return (
    <section className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
      <SectionHeading
        eyebrow="Our Partners"
        href="/travel/airlines-serving"
        linkLabel="Routes and airlines"
        title="Airlines serving Grenada"
      />
      <ul className="grid grid-cols-3 items-center gap-x-8 gap-y-10 sm:grid-cols-4 lg:grid-cols-6">
        {AIRLINES.map(([file, name]) => (
          <li className="flex justify-center" key={file}>
            <Image
              alt={name}
              className="h-9 w-auto object-contain opacity-80 transition-opacity hover:opacity-100"
              height={36}
              src={`/images/airlines/${file}.png`}
              width={120}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function LatestNews() {
  const news = getNews().slice(0, 3);
  if (news.length === 0) {
    return null;
  }
  return (
    <section className="bg-gaa-mist">
      <div className="mx-auto max-w-7xl px-4 py-20 lg:px-8">
        <SectionHeading
          eyebrow="News & Media"
          href="/news"
          linkLabel="All news"
          title="Latest from the GAA"
        />
        <div className="grid gap-6 md:grid-cols-3">
          {news.map((post) => (
            <Link
              className="group flex flex-col rounded-2xl border border-gaa-rule bg-white p-6 transition-all hover:-translate-y-0.5 hover:shadow-lg"
              href={`/news/${post.slug}`}
              key={post.slug}
            >
              <time className="text-gaa-muted text-xs">
                {formatDate(post.publishedAt)}
              </time>
              <h3 className="mt-2 flex-1 font-display font-semibold text-gaa-navy text-lg leading-snug group-hover:text-gaa-sea">
                {post.title}
              </h3>
              <p className="mt-3 line-clamp-3 text-gaa-muted text-sm leading-relaxed">
                {post.dek}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function BusinessBand() {
  return (
    <section className="bg-gaa-navy-ink">
      <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-8 px-4 py-16 lg:flex-row lg:items-center lg:px-8">
        <div>
          <p className="font-semibold text-gaa-gold text-xs uppercase tracking-[0.2em]">
            Business &amp; Partners
          </p>
          <h2 className="mt-3 max-w-xl font-bold font-display text-3xl text-white">
            Do business with Grenada&rsquo;s airports
          </h2>
          <p className="mt-3 max-w-xl text-white/70">
            Aviation support services, cargo, advertising, commercial space and
            air service development — partner with the GAA.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            asChild
            className="bg-gaa-gold font-semibold text-gaa-navy-ink hover:bg-gaa-gold-deep"
            size="lg"
          >
            <Link href="/business">Business services</Link>
          </Button>
          <Button
            asChild
            className="border-white/40 bg-transparent text-white hover:bg-white/10"
            size="lg"
            variant="outline"
          >
            <Link href="/contact">Contact us</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

export default function HomePage() {
  return (
    <>
      <Hero />
      <div className="relative z-10 mx-auto -mt-24 max-w-5xl px-4 lg:px-8">
        <FlightBoard compact flights={SAMPLE_FLIGHTS} />
      </div>
      <div className="py-16">
        <QuickTasks />
      </div>
      <Airports />
      <Experience />
      <Airlines />
      <LatestNews />
      <BusinessBand />
    </>
  );
}
