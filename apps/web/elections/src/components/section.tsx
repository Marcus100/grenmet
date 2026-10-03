import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import { FlagStripe } from "@/components/flag-stripe";
import { PageLearning } from "@/components/learn/page-learning";
import { Photo } from "@/components/photo";
import type { PageLearningTopic } from "@/data/page-learning";
import type { PhotoId } from "@/data/photos";

/** A page section under a 2px ink rule, with an optional "see all" link. */
export function Section({
  id,
  title,
  intro,
  more,
  children,
}: {
  id: string;
  title: string;
  intro?: React.ReactNode;
  more?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="mx-auto max-w-[1240px] px-4 pt-12 sm:px-6"
    >
      <div className="relative mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-el-ink border-t-2 pt-3">
        <FlagStripe className="absolute -top-0.5 left-0 h-1.5 w-16" />
        <h2
          className="scroll-mt-20 font-bold text-2xl sm:text-[1.625rem]"
          id={`${id}-title`}
        >
          {title}
        </h2>
        {more && (
          <Link
            className="font-semibold text-base underline decoration-el-rule-2 underline-offset-4 hover:decoration-el-ink"
            href={more.href}
          >
            {more.label} →
          </Link>
        )}
        {intro && (
          <p className="w-full max-w-prose text-el-ink-2 text-lg leading-relaxed">
            {intro}
          </p>
        )}
      </div>
      {children}
    </section>
  );
}

const TINTS = {
  red: "bg-el-flag-red-tint",
  gold: "bg-el-flag-gold-tint",
  green: "bg-el-flag-green-tint",
} as const;

/**
 * The opening block of an inner page: eyebrow, title and deck. A `photo`
 * sits beside the text on wide screens, as on a newspaper section front; a
 * `tint` lays a pale flag colour behind the whole block, under the stripe.
 */
export function PageHead({
  eyebrow,
  title,
  deck,
  children,
  learning,
  photo,
  tint,
}: {
  learning?: PageLearningTopic;
  eyebrow: string;
  title: string;
  deck?: React.ReactNode;
  children?: React.ReactNode;
  photo?: PhotoId;
  tint?: keyof typeof TINTS;
}) {
  const head = (
    <header
      className={cn(
        "mx-auto max-w-[1240px] px-4 pt-8 sm:px-6",
        photo &&
          "grid gap-x-12 gap-y-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
      )}
    >
      <div className="min-w-0">
        {!tint && <FlagStripe className="mb-4 h-1.5 w-16" />}
        <p className="font-semibold text-base text-el-ink-2 uppercase leading-relaxed tracking-[0.08em]">
          {eyebrow}
        </p>
        <h1 className="mt-2.5 max-w-[24ch] font-bold text-[clamp(1.875rem,4.2vw,3rem)] leading-[1.08] tracking-[-0.022em]">
          {title}
        </h1>
        {deck && (
          <p className="mt-3.5 max-w-[62ch] font-serif text-el-ink-2 text-lg leading-normal sm:text-[1.1875rem]">
            {deck}
          </p>
        )}
        {children}
        {learning && <PageLearning topic={learning} />}
      </div>
      {photo && (
        <Photo
          className="lg:pt-2"
          id={photo}
          priority
          sizes="(max-width: 1024px) 100vw, 560px"
        />
      )}
    </header>
  );
  if (!tint) return head;
  return (
    <div className={cn("pb-8", TINTS[tint])}>
      <FlagStripe />
      {head}
    </div>
  );
}
