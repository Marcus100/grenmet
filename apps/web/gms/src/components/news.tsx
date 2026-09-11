import Image from "next/image";
import { fetchPublishedContent } from "@/lib/cms";
import { contentToArticle, type WeatherArticle } from "@/lib/editorial";

function NewsCard({ post }: { post: WeatherArticle }) {
  return (
    <a
      className="flex flex-col overflow-clip rounded border border-gm-border bg-background p-px shadow-card"
      href={post.href}
    >
      <div className="relative h-[254px] w-full shrink-0 overflow-clip bg-gm-surface">
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="100vw"
          src={post.imageUrl}
        />
      </div>
      <div className="flex flex-col gap-2 p-4">
        <p className="font-bold text-base text-gm-navy leading-6">
          {post.title}
        </p>
        <p className="text-body-sm text-gm-text-secondary leading-body-sm">
          {post.summary}
        </p>
        <p className="text-gm-blue-ink text-label leading-label">
          Published {post.published}
        </p>
      </div>
    </a>
  );
}

function LeadNewsCard({ post }: { post: WeatherArticle }) {
  return (
    <a className="flex w-175 min-w-0 flex-col" href={post.href}>
      <div className="relative h-80 w-full overflow-hidden rounded-md bg-gm-surface">
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="700px"
          src={post.imageUrl}
        />
      </div>
      <div className="flex flex-col gap-2.5 pt-5">
        <p className="max-w-[26ch] font-bold text-gm-blue text-heading-sm leading-heading-sm">
          {post.title}
        </p>
        <p className="max-w-[62ch] text-body-base text-gm-text-secondary leading-body-base">
          {post.summary}
        </p>
        <p className="font-semibold text-body-sm text-gm-text-muted uppercase leading-body-sm tracking-wide">
          Published {post.published}
        </p>
      </div>
    </a>
  );
}

function ListNewsRow({ post }: { post: WeatherArticle }) {
  return (
    <a
      className="flex items-start gap-6 border-gm-border border-t py-6 first:pt-0"
      href={post.href}
    >
      <div className="flex flex-1 flex-col gap-2">
        <p className="font-bold text-gm-blue text-nav leading-nav">
          {post.title}
        </p>
        {/* The summary is in the data and the mobile card already shows it;
            rendering it here fills the column and matches that treatment. */}
        <p className="text-body-sm text-gm-text-secondary leading-body-sm">
          {post.summary}
        </p>
        <p className="font-semibold text-body-sm text-gm-text-muted uppercase leading-body-sm tracking-wide">
          Published {post.published}
        </p>
      </div>
      <div className="relative h-30.5 w-40 shrink-0 overflow-hidden rounded-md bg-gm-surface xl:w-52">
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="208px"
          src={post.imageUrl}
        />
      </div>
    </a>
  );
}

export async function News() {
  const result = await fetchPublishedContent("article", "news");
  const posts = result.articles.map(contentToArticle);
  const [lead, ...rest] = posts;

  return (
    <section className="mb-4 flex flex-col gap-4 lg:-mx-8 lg:mb-8 lg:gap-7 lg:bg-gm-surface lg:px-8 lg:py-12">
      <div className="flex h-7 items-center justify-between">
        <p className="font-bold text-gm-navy text-heading-sm leading-heading-sm lg:text-heading-md lg:leading-heading-md">
          Weather news
        </p>
        <a
          className="font-medium text-body text-gm-blue-ink leading-body"
          href="/news"
        >
          See more
        </a>
      </div>

      {result.status === "unavailable" && (
        <p role="status">News cannot be retrieved right now.</p>
      )}
      {result.status === "ok" && posts.length === 0 && (
        <p>No published articles are available.</p>
      )}
      {/* Mobile: stacked equal cards */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:hidden [&>*:first-child]:md:col-span-2">
        {posts.map((post) => (
          <NewsCard key={post.id} post={post} />
        ))}
      </div>

      {/* Desktop: one lead article beside a list of the rest */}
      {/* The list column holds a floor so the lead shrinks instead: below
          about 1200px the rows had no room left for their own text. */}
      <div className="hidden lg:flex lg:items-start lg:gap-10">
        {lead && <LeadNewsCard post={lead} />}
        <div className="flex min-w-112 flex-1 flex-col">
          {rest.map((post) => (
            <ListNewsRow key={post.id} post={post} />
          ))}
        </div>
      </div>
    </section>
  );
}
