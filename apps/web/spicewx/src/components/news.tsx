import Image from "next/image";

const posts = [
  {
    id: 1,
    title:
      "Tropical wave brings heavy showers to southern parishes this weekend",
    description:
      "Are you planning outdoor activities this weekend? Residents in St. George's and St. David's should prepare for periods of heavy rain and gusty winds.",
    imageUrl:
      "https://images.unsplash.com/photo-1561553543-e4c7b608b98d?auto=format&fit=crop&w=800&q=80",
    published: "Friday, May 16",
    href: "#",
  },
  {
    id: 2,
    title: "Sea state remains rough — small craft advisory in effect",
    description:
      "Wave heights of 6–9 ft are expected through the weekend. The GMS urges mariners to exercise extreme caution and monitor updated bulletins.",
    imageUrl:
      "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=800&q=80",
    published: "Thursday, May 15",
    href: "#",
  },
  {
    id: 3,
    title: "Dry season outlook: warmer and drier conditions ahead for Grenada",
    description:
      "The seasonal forecast indicates below-normal rainfall and above-normal temperatures for the coming months across the tri-island state.",
    imageUrl:
      "https://images.unsplash.com/photo-1504370805625-d32c54b16100?auto=format&fit=crop&w=800&q=80",
    published: "Wednesday, May 14",
    href: "#",
  },
];

export function News() {
  return (
    <section className="mb-4">
      <h2 className="mb-4 font-bold text-gm-navy text-xl">Weather news</h2>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {posts.map((post) => (
          <a
            className="group flex flex-col overflow-hidden rounded border border-gm-border bg-white shadow-sm transition hover:shadow-md"
            href={post.href}
            key={post.id}
          >
            <div className="relative aspect-video w-full overflow-hidden bg-gray-100">
              <Image
                alt=""
                className="h-full w-full object-cover transition group-hover:scale-105"
                fill
                sizes="(min-width: 1024px) 33vw, 100vw"
                src={post.imageUrl}
              />
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h3 className="font-bold text-base text-gm-navy leading-snug group-hover:text-gm-blue">
                {post.title}
              </h3>
              <p className="text-gray-600 text-sm leading-relaxed lg:line-clamp-2">
                {post.description}
              </p>
              <p className="pt-1 text-gm-blue text-xs lg:mt-auto lg:pt-2">
                Published {post.published}
              </p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
