import { EmptyState, PageIntro, StoryCard } from "@/components/editorial";
import { getCurrentArticles } from "@/lib/content";
import { GUIDE_PATHS, selectStories } from "@/lib/discovery";
export const metadata = { title: "Guides & explainers" };
export default function LearnPage() {
  const guides = selectStories(getCurrentArticles(), GUIDE_PATHS);
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <PageIntro
        eyebrow="Go a little deeper"
        title="Less jargon. More understanding."
      >
        <p>
          Guides and explainers that make a complicated subject easier to
          follow. These sourced summaries are awaiting human editorial review.
        </p>
      </PageIntro>
      {guides.length ? (
        <div className="grid gap-10 border-signal-rule border-t pt-8 md:grid-cols-2 lg:grid-cols-3">
          {guides.map((article) => (
            <StoryCard article={article} key={article.slug} />
          ))}
        </div>
      ) : (
        <EmptyState title="Our guides are on their way.">
          Explore the available topics in the meantime.
        </EmptyState>
      )}
    </div>
  );
}
