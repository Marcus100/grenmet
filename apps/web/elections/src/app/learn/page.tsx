import type { Metadata } from "next";
import Link from "next/link";
import { PageHead, Section } from "@/components/section";
import { GUIDES } from "@/data/learning";
export const metadata: Metadata = {
  title: "Learn",
  description:
    "Understand Grenada’s elections, government and results through sourced explanations, worked examples and practical exercises.",
};
export default function LearnPage() {
  return (
    <>
      <PageHead
        deck="Start with a question. Learn the idea, test it with an example, then explore Grenada’s records for yourself."
        eyebrow="Learn through the election"
        title="Make sense of every vote"
      >
        <Link
          className="mt-5 inline-block underline underline-offset-4"
          href="/search"
        >
          Find a topic, person or election →
        </Link>
      </PageHead>
      <Section
        id="learning-guides"
        intro="No specialist knowledge needed. Each guide explains its sources and offers a next step."
        title="What would you like to understand?"
      >
        <ol className="grid gap-6 md:grid-cols-2">
          {GUIDES.map((guide, i) => (
            <li className="border-el-rule border-t pt-4" key={guide.slug}>
              <p className="text-el-muted text-lg leading-relaxed">
                Guide {i + 1}
              </p>
              <h3 className="mt-1 font-bold font-serif text-xl">
                <Link className="hover:underline" href={`/learn/${guide.slug}`}>
                  {guide.question}
                </Link>
              </h3>
              <p className="mt-2 text-el-ink-2 text-lg leading-relaxed">
                {guide.answer}
              </p>
              <Link
                className="mt-3 inline-block text-lg underline underline-offset-4"
                href={`/learn/${guide.slug}`}
              >
                {guide.title} →
              </Link>
            </li>
          ))}
        </ol>
      </Section>
      <Section
        id="learning-practice"
        intro="These tools use recorded results or clearly labelled assumptions. They do not tell you how to vote."
        title="Learn by trying"
      >
        <div className="flex flex-wrap gap-5">
          {[
            ["/trends", "Read the story in the numbers"],
            ["/how-close", "Explore margins and swing"],
            ["/make-your-map", "Build a possible outcome"],
            ["/sources", "Check our evidence"],
          ].map(([href, label]) => (
            <Link
              className="underline underline-offset-4"
              href={href ?? "/learn"}
              key={href}
            >
              {label}
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
