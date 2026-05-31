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
      className="flex flex-col overflow-clip rounded border border-gm-border bg-background p-px shadow-gm-card"
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
      <div className="flex flex-col gap-gm-8 p-gm-16">
        <p className="font-bold text-base text-gm-navy leading-6">
          {post.title}
        </p>
        <p className="text-gm-body-sm text-gm-text-secondary leading-gm-body-sm">
          {post.summary}
        </p>
        <p className="text-gm-blue text-gm-label leading-gm-label">
          Published {post.published}
        </p>
      </div>
    </a>
  );
}

export function News() {
  return (
    <section className="mb-4 flex flex-col gap-gm-16">
      <div className="flex h-gm-28 items-center justify-between">
        <p className="font-bold text-gm-heading-sm text-gm-navy leading-gm-heading-sm">
          Weather news
        </p>
        <a
          className="font-medium text-gm-blue text-gm-body leading-gm-body"
          href="/news"
        >
          See more
        </a>
      </div>

      <div className="flex flex-col gap-gm-16 lg:grid lg:grid-cols-3">
        {posts.map((post) => (
          <NewsCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
