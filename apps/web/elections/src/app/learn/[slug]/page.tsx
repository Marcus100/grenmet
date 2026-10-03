import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DenominatorLab } from "@/components/learn/denominator-lab";
import { EvidenceCitation } from "@/components/learn/evidence";
import { PageHead, Section } from "@/components/section";
import { GUIDES, learningGuide } from "@/data/learning";

interface Props {
  params: Promise<{ slug: string }>;
}
export function generateStaticParams() {
  return GUIDES.map(({ slug }) => ({ slug }));
}
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const guide = learningGuide((await params).slug);
  return guide ? { title: guide.title, description: guide.answer } : {};
}
export default async function GuidePage({ params }: Props) {
  const guide = learningGuide((await params).slug);
  if (!guide) notFound();
  return (
    <>
      <PageHead
        deck={guide.answer}
        eyebrow="Learn · Grenada’s elections"
        title={guide.question}
      >
        <Link
          className="mt-4 inline-block text-lg underline underline-offset-4"
          href="/learn"
        >
          All learning guides
        </Link>
      </PageHead>
      {guide.sections.map((section, i) => (
        <Section id={`lesson-${i}`} key={section.title} title={section.title}>
          <div className="max-w-prose space-y-4 leading-relaxed">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            <div className="space-y-2">
              {section.sources.map((id) => (
                <EvidenceCitation id={id} key={id} />
              ))}
            </div>
          </div>
        </Section>
      ))}
      <Section id="worked-example" title={guide.example.title}>
        <div className="max-w-prose bg-el-paper-2 p-6 leading-relaxed">
          <p>{guide.example.text}</p>
          <p className="mt-3 text-el-muted text-lg leading-relaxed">
            Illustrative arithmetic and reasoning, not an observed election
            result.
          </p>
        </div>
      </Section>
      {guide.slug === "counting-and-results" && (
        <Section id="denominator-lab" title="Change the numbers yourself">
          <DenominatorLab />
        </Section>
      )}
      <Section id="misconception" title="A common misunderstanding">
        <p className="max-w-prose leading-relaxed">{guide.misconception}</p>
      </Section>
      <Section id="self-check" title="Try explaining it yourself">
        <details className="max-w-prose border-el-rule border-y py-4">
          <summary className="cursor-pointer font-semibold">
            {guide.exercise.question}
          </summary>
          <p className="mt-3 leading-relaxed">{guide.exercise.answer}</p>
        </details>
        <p className="mt-2 text-el-muted text-lg leading-relaxed">
          Think it through, then open the explanation. No answers are saved.
        </p>
      </Section>
      <Section id="next" title="Put it into practice">
        <ul className="flex flex-wrap gap-5">
          {guide.next.map((link) => (
            <li key={link.href}>
              <Link
                className="font-semibold underline underline-offset-4"
                href={link.href}
              >
                {link.label} →
              </Link>
            </li>
          ))}
        </ul>
        <Link
          className="mt-6 inline-block text-lg underline underline-offset-4"
          href="/sources"
        >
          Evidence, methods and unresolved gaps
        </Link>
      </Section>
    </>
  );
}
