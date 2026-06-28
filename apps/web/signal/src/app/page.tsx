import { CardGrid } from "@/components/card-grid";
import { LeadStory } from "@/components/lead-story";
import { PodcastBlock } from "@/components/podcast-block";
import { SectionBlock } from "@/components/section-block";
import { StoryListItem } from "@/components/story-list-item";
import { SubscribeBand } from "@/components/subscribe-band";
import { WatchBlock } from "@/components/watch-block";
import { getLatestBrief, getPublishedArticles } from "@/lib/content";
import { getSection } from "@/lib/nav";

function sectionLabel(slug: string): string {
  return getSection(slug)?.label ?? slug;
}

export default function HomePage() {
  const brief = getLatestBrief();
  const articles = getPublishedArticles();
  const picks = articles.slice(0, 2);
  const latest = articles.slice(2, 7);

  return (
    <>
      <SubscribeBand id="subscribe" />

      <SectionBlock title="The Latest">
        <div className="flex flex-col gap-6">
          {brief ? (
            <LeadStory
              dek={brief.dek}
              eyebrow="Morning Signal"
              heroAlt="Grenada Signal — today's brief"
              heroImage="/images/placeholder-green.svg"
              href={`/today/${brief.date}`}
              meta={`Presented by ${brief.presenter}`}
              title={brief.title}
            />
          ) : null}

          {latest.length > 0 ? (
            <div className="flex flex-col">
              {latest.map((article) => (
                <StoryListItem
                  author={article.author}
                  eyebrow={sectionLabel(article.section)}
                  href={`/${article.section}/${article.slug}`}
                  key={`${article.section}/${article.slug}`}
                  publishedAt={article.publishedAt}
                  title={article.title}
                />
              ))}
            </div>
          ) : null}
        </div>
      </SectionBlock>

      {picks.length > 0 ? (
        <SectionBlock title="Editor's Picks">
          <CardGrid
            items={picks.map((article) => ({
              href: `/${article.section}/${article.slug}`,
              eyebrow: sectionLabel(article.section),
              title: article.title,
              image: article.heroImage,
              alt: article.heroAlt,
            }))}
          />
        </SectionBlock>
      ) : null}

      <SectionBlock id="podcast" title="Podcast">
        <PodcastBlock />
      </SectionBlock>

      <SectionBlock id="watch" title="Watch">
        <WatchBlock />
      </SectionBlock>

      <SubscribeBand />
    </>
  );
}
