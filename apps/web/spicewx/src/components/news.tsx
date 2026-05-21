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
      className="flex flex-col overflow-clip rounded-[4px] border border-[#d0d5dd] bg-white p-px shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]"
      href={post.href}
    >
      <div className="relative h-[254px] w-full shrink-0 overflow-clip bg-[#f3f4f6]">
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="100vw"
          src={post.imageUrl}
        />
      </div>
      <div className="flex flex-col gap-[8px] p-[16px]">
        <p className="font-bold text-[#150068] text-[15px] leading-[21px]">
          {post.title}
        </p>
        <p className="text-[#4a5565] text-[13px] leading-[20px]">
          {post.summary}
        </p>
        <p className="text-[#2478f2] text-[11px] leading-[16px]">
          Published {post.published}
        </p>
      </div>
    </a>
  );
}

export function News() {
  return (
    <section className="mb-4 flex flex-col gap-[16px]">
      <div className="flex h-[28px] items-center justify-between">
        <p className="font-bold text-[#150068] text-[18px] leading-[24px]">
          Weather news
        </p>
        <a
          className="font-medium text-[#2478f2] text-[14px] leading-[20px]"
          href="/news"
        >
          See more
        </a>
      </div>

      <div className="flex flex-col gap-[16px] lg:grid lg:grid-cols-3">
        {posts.map((post) => (
          <NewsCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
