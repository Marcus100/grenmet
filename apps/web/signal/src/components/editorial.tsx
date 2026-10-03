import { cn } from "@barrelsgd/ui/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";
import { Eyebrow } from "@/components/eyebrow";
import { StoryImage } from "@/components/story-image";
import type { Article } from "@/lib/content";
import { getSection } from "@/lib/nav";

export function PageIntro({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <header className="mb-8 max-w-3xl border-signal-gold border-t-4 pt-6">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-4 font-semibold font-serif text-4xl leading-tight tracking-tight sm:text-5xl">
        {title}
      </h1>
      <div className="mt-4 text-lg leading-relaxed">{children}</div>
    </header>
  );
}
export function StoryCard({
  article,
  lead = false,
  headingLevel = 2,
  showImage = true,
  wideImage = false,
}: {
  article: Article;
  lead?: boolean;
  headingLevel?: 2 | 3;
  showImage?: boolean;
  wideImage?: boolean;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <article className="min-w-0">
      {article.reviewStatus === "sample" ? (
        <p className="mb-3 text-signal-muted text-sm">
          June 2026 design sample
        </p>
      ) : null}
      {showImage ? <StoryImage article={article} wide={wideImage} /> : null}
      <Eyebrow>{getSection(article.section)?.label ?? article.section}</Eyebrow>
      <Heading
        className={cn(
          "mt-3 font-semibold font-serif leading-tight tracking-tight",
          lead ? "text-3xl sm:text-4xl" : "text-2xl"
        )}
      >
        <Link
          className="hover:text-signal-green hover:underline"
          href={`/${article.section}/${article.slug}`}
        >
          {article.title}
        </Link>
      </Heading>
      <p className="mt-3 text-lg leading-relaxed">{article.dek}</p>
    </article>
  );
}
export function EmptyState({
  title = "There’s more to come.",
  children,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="border-signal-rule border-y py-10">
      <h2 className="font-semibold font-serif text-2xl">{title}</h2>
      <p className="mt-3 max-w-2xl text-lg leading-relaxed">{children}</p>
      <Link
        className="mt-4 inline-flex min-h-11 items-center text-signal-green underline underline-offset-4"
        href="/topics"
      >
        Explore all topics →
      </Link>
    </div>
  );
}
export function ArchiveInvitation() {
  return (
    <aside
      aria-labelledby="keep-reading-title"
      className="mx-auto mt-12 max-w-7xl border-signal-gold border-t-4 bg-secondary px-4 py-10 sm:px-8 lg:py-12"
    >
      <div className="grid gap-8 lg:grid-cols-3 lg:gap-12">
        <div>
          <Eyebrow>There’s more to the story</Eyebrow>
          <h2
            className="mt-4 font-semibold font-serif text-4xl leading-tight"
            id="keep-reading-title"
          >
            Stay curious.
            <br />
            Keep reading.
          </h2>
          <p className="mt-4 text-lg leading-relaxed">
            Catch up on what you missed, make sense of an issue, or follow a new
            interest. Your next good read starts here.
          </p>
          <Link
            className="mt-6 inline-flex min-h-11 items-center border-signal-green border-b-2 font-semibold text-signal-green"
            href="/archive"
          >
            Explore the archive →
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-3 lg:col-span-2">
          {[
            {
              number: "01",
              title: "Catch up",
              text: "Revisit Daily Signal for the headlines and useful details from an earlier edition.",
              label: "Browse past editions",
              href: "/briefs",
            },
            {
              number: "02",
              title: "Go deeper",
              text: "Find explanations and practical guides to the decisions, opportunities and changes around you.",
              label: "Read the guides",
              href: "/learn",
            },
            {
              number: "03",
              title: "Follow your curiosity",
              text: "From culture and sport to money and the wider Caribbean—choose what interests you.",
              label: "Explore every topic",
              href: "/topics",
            },
          ].map((item) => (
            <div
              className="flex flex-col border-signal-rule border-t pt-5"
              key={item.href}
            >
              <span
                aria-hidden="true"
                className="font-semibold text-signal-green text-sm"
              >
                {item.number}
              </span>
              <h3 className="mt-4 font-semibold font-serif text-2xl leading-tight">
                {item.title}
              </h3>
              <p className="mt-3 text-base leading-relaxed">{item.text}</p>
              <Link
                className="mt-auto inline-flex min-h-11 items-center pt-6 font-semibold text-signal-green text-sm underline underline-offset-4"
                href={item.href}
              >
                {item.label} →
              </Link>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
export function DemoNote({ reviewStatus }: { reviewStatus?: string }) {
  if (reviewStatus === "editorial-preview") {
    return (
      <aside className="my-6 border-signal-gold border-l-4 pl-4 text-base leading-relaxed">
        <strong>Editorial preview.</strong> Source-based summary prepared for
        human review. Sources checked on 3 October 2026; follow the linked
        originals for updates. This has not been approved as Signal reporting.
      </aside>
    );
  }
  return (
    <aside className="my-6 border-signal-gold border-l-4 pl-4 text-base leading-relaxed">
      <strong>Sample story.</strong> This is demonstration content from June
      2026. Claims, forecasts and deadlines have not been verified for
      publication. Do not rely on it for current decisions.
    </aside>
  );
}
