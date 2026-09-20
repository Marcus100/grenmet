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
        <p className="font-bold text-body-base text-gm-navy leading-body-base">
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

function DesktopNewsCard({ post }: { post: WeatherArticle }) {
  return (
    <a className="flex flex-col gap-4" href={post.href}>
      <div className="relative h-56 w-full shrink-0 overflow-hidden rounded-md bg-gm-surface">
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="33vw"
          src={post.imageUrl}
        />
      </div>
      <div className="flex flex-col gap-2">
        <p className="font-bold text-gm-navy text-heading-sm leading-heading-sm">
          {post.title}
        </p>
        <p className="text-body-base text-gm-text-secondary leading-body-base">
          {post.summary}
        </p>
        <p className="font-semibold text-body-sm text-gm-text-muted leading-body-sm">
          Published {post.published}
        </p>
      </div>
    </a>
  );
}

export async function News() {
  const result = await fetchPublishedContent("news");
  const posts = result.articles.map(contentToArticle);

  return (
    <section className="mb-4 flex flex-col gap-4 lg:-mx-8 lg:mb-8 lg:gap-7 lg:bg-gm-surface lg:px-8 lg:py-12">
      <div className="flex h-7 items-center justify-between">
        <p className="font-bold text-gm-navy text-heading-sm leading-heading-sm lg:text-heading-md lg:leading-heading-md">
          Latest publications
        </p>
        <a className="text-gm-blue-ink underline" href="/news">
          All Publications
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

      {/* Desktop: flat image-led cards in equal columns */}
      <div className="hidden lg:grid lg:grid-cols-3 lg:gap-8">
        {posts.map((post) => (
          <DesktopNewsCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
