import { PageIntro } from "@/components/editorial";
import { SubscribeForm } from "@/components/subscribe-form";
export const metadata = { title: "About Signal" };
export default function AboutPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <PageIntro
        eyebrow="About the publication"
        title="From Grenada. For curious minds everywhere."
      >
        <p>
          Grenada Signal is being developed as a daily news and entertainment
          destination rooted in Grenada, Carriacou and Petite Martinique,
          welcoming readers across the Caribbean and around the world.
        </p>
      </PageIntro>
      <div className="space-y-6 text-lg leading-relaxed">
        <p>
          Start with a concise briefing. Stay for reporting, curated coverage,
          entertainment, sport, food, guides and opportunities. Grenada leads
          our coverage, alongside Caribbean and international stories worth your
          attention.
        </p>
        <h2 className="font-serif text-3xl font-semibold" id="editorial">
          Our editorial approach
        </h2>
        <p>
          The intended approach is simple: explain what happened, why it
          matters, what the evidence says and what remains uncertain. Curated
          coverage should credit and link to its original sources. Public
          bylines should make authorship clear.
        </p>
        <h2 className="font-serif text-3xl font-semibold">
          About this preview
        </h2>
        <p>
          The homepage now contains source-based editorial previews checked on 3
          October 2026, awaiting human review. Original June design samples
          remain in the archive and at their existing URLs, labelled as samples.
          Source attribution identifies the underlying reporting, not authorship
          of these summaries.
        </p>
        <p>Reading is free and requires no account.</p>
        <h2 className="font-serif text-3xl font-semibold" id="newsletter">
          Get the newsletter
        </h2>
        <p>
          Sign up for email updates from Grenada Signal. We will send one
          message to confirm your address; you are only subscribed once you
          click the link in it.
        </p>
        <SubscribeForm />
      </div>
    </article>
  );
}
