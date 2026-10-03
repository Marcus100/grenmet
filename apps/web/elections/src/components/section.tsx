import Link from "next/link";
import { PageLearning } from "@/components/learn/page-learning";
import type { PageLearningTopic } from "@/data/page-learning";

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
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-el-ink border-t-2 pt-3">
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

/** The opening block of an inner page: eyebrow, title and deck. */
export function PageHead({
  eyebrow,
  title,
  deck,
  children,
  learning,
}: {
  learning?: PageLearningTopic;
  eyebrow: string;
  title: string;
  deck?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className="mx-auto max-w-[1240px] px-4 pt-8 sm:px-6">
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
    </header>
  );
}
