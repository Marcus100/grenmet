import Image from "next/image";

const posts = [
  {
    id: 1,
    title:
      "Tropical wave brings heavy showers to southern parishes this weekend",
    summary:
      "Wave heights of 6–9 ft are expected through the weekend. The GMS urges mariners to exercise extreme caution and monitor updated bulletins.",
    imageUrl:
      "https://images.unsplash.com/photo-1561553543-e4c7b608b98d?auto=format&fit=crop&w=800&q=80",
    published: "Friday, May 16",
    href: "#",
  },
  {
    id: 2,
    title: "Sea state remains rough — small craft advisory in effect",
    summary:
      "Wave heights of 6–9 ft are expected through the weekend. The GMS urges mariners to exercise extreme caution and monitor updated bulletins.",
    imageUrl:
      "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=800&q=80",
    published: "Thursday, May 15",
    href: "#",
  },
  {
    id: 3,
    title: "Dry season outlook: warmer and drier conditions ahead for Grenada",
    summary:
      "The seasonal forecast indicates below-normal rainfall and above-normal temperatures for the coming months across the tri-island state.",
    imageUrl:
      "https://images.unsplash.com/photo-1504370805625-d32c54b16100?auto=format&fit=crop&w=800&q=80",
    published: "Wednesday, May 14",
    href: "#",
  },
];

function NewsCard({ post }: { post: (typeof posts)[number] }) {
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
        <p className="text-gm-blue text-label leading-label">
          Published {post.published}
        </p>
      </div>
    </a>
  );
}

function LeadNewsCard({ post }: { post: (typeof posts)[number] }) {
  return (
    <a className="flex w-175 shrink-0 flex-col" href={post.href}>
      <div className="relative h-99 w-full overflow-hidden rounded-md bg-gm-surface">
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

function ListNewsRow({ post }: { post: (typeof posts)[number] }) {
  return (
    <a
      className="flex items-start gap-6 border-gm-border border-t py-6 first:pt-0"
      href={post.href}
    >
      <div className="flex flex-1 flex-col gap-2">
        <p className="font-bold text-gm-blue text-nav leading-nav">
          {post.title}
        </p>
        <p className="font-semibold text-body-sm text-gm-text-muted uppercase leading-body-sm tracking-wide">
          Published {post.published}
        </p>
      </div>
      <div className="relative h-30.5 w-52 shrink-0 overflow-hidden rounded-md bg-gm-surface">
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

export function News() {
  const [lead, ...rest] = posts;

  return (
    <section className="mb-4 flex flex-col gap-4 lg:-mx-8 lg:mb-8 lg:gap-7 lg:bg-gm-surface lg:px-8 lg:py-12">
      <div className="flex h-7 items-center justify-between">
        <p className="font-bold text-gm-navy text-heading-sm leading-heading-sm lg:text-heading-md lg:leading-heading-md">
          Weather news
        </p>
        <a
          className="font-medium text-body text-gm-blue leading-body"
          href="/news"
        >
          See more
        </a>
      </div>

      {/* Mobile: stacked equal cards */}
      <div className="flex flex-col gap-4 lg:hidden">
        {posts.map((post) => (
          <NewsCard key={post.id} post={post} />
        ))}
      </div>

      {/* Desktop: one lead article beside a list of the rest */}
      <div className="hidden lg:flex lg:items-start lg:gap-10">
        {lead && <LeadNewsCard post={lead} />}
        <div className="flex flex-1 flex-col">
          {rest.map((post) => (
            <ListNewsRow key={post.id} post={post} />
          ))}
        </div>
      </div>
    </section>
  );
}
