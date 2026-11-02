import Image from "next/image";
import Link from "next/link";
import {
  type ContentCollection,
  fetchPublishedContent,
  isOptimizableImage,
} from "@/lib/cms";
import { contentToArticle, type WeatherArticle } from "@/lib/editorial";

function NewsCard({ post }: { post: WeatherArticle }) {
  return (
    <a
      className="border-gm-border bg-background shadow-card flex flex-col overflow-clip rounded border p-px"
      href={post.href}
    >
      <div className="bg-gm-surface relative h-[254px] w-full shrink-0 overflow-clip">
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="100vw"
          src={post.imageUrl}
          unoptimized={!isOptimizableImage(post.imageUrl)}
        />
      </div>
      <div className="flex flex-col gap-2 p-4">
        <p className="text-body-base text-gm-heading leading-body-base font-bold">
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
      <div className="bg-gm-surface relative h-56 w-full shrink-0 overflow-hidden rounded-md">
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="33vw"
          src={post.imageUrl}
          unoptimized={!isOptimizableImage(post.imageUrl)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-gm-heading text-heading-sm leading-heading-sm font-bold">
          {post.title}
        </p>
        <p className="text-body-base text-gm-text-secondary leading-body-base">
          {post.summary}
        </p>
        <p className="text-body-sm text-gm-text-muted leading-body-sm font-semibold">
          Published {post.published}
        </p>
      </div>
    </a>
  );
}

/** An editorial index: Stories by default, or report write-ups. */
export async function News({
  collection = "stories",
  title = "Stories from our atmosphere and ocean",
  noun = "stories",
}: {
  collection?: ContentCollection;
  noun?: string;
  title?: string;
} = {}) {
  const result = await fetchPublishedContent(collection);
  const posts = result.articles.map(contentToArticle);

  return (
    <section className="lg:bg-gm-surface mb-4 flex flex-col gap-4 lg:-mx-8 lg:mb-8 lg:gap-7 lg:px-8 lg:py-12">
      <div className="flex h-7 items-center justify-between">
        <p className="text-gm-heading text-heading-sm leading-heading-sm lg:text-heading-md lg:leading-heading-md font-bold">
          {title}
        </p>
        <Link
          className="text-gm-blue-ink underline"
          href="/climate/publications"
        >
          Reports and publications
        </Link>
      </div>

      {result.status === "unavailable" && (
        <p role="status">
          {noun.charAt(0).toUpperCase() + noun.slice(1)} cannot be retrieved
          right now.
        </p>
      )}
      {result.status === "ok" && posts.length === 0 && (
        <p>No {noun} are published yet.</p>
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
