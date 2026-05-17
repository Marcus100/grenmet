import Image from "next/image";

const posts = [
  {
    id: 1,
    author: "GMS Grenada",
    time: "Yesterday at 10:41 am",
    paragraphs: [
      "We're halfway through May and conditions across Grenada remain partly cloudy with isolated afternoon showers.",
      "Temperatures have stayed near seasonal norms. The northern parishes have seen slightly drier conditions compared to the south.",
    ],
    image:
      "https://images.unsplash.com/photo-1504370805625-d32c54b16100?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: 2,
    author: "GMS Grenada",
    time: "May 15 at 10:38 pm",
    paragraphs: [
      "What will the weather look like after 17 May? The week begins with high pressure building from the north bringing drier and warmer conditions.",
      "In the south, there will be more changeable weather and rain showers as a tropical wave moves through.",
    ],
    image:
      "https://images.unsplash.com/photo-1561553543-e4c7b608b98d?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: 3,
    author: "GMS Grenada",
    time: "May 15 at 9:08 pm",
    paragraphs: [
      "The changing sea state makes coastal conditions difficult to predict for this weekend. We'll keep you updated:",
      "Wave heights of 6–9 ft are expected. Small craft should remain in harbour. Swell direction is NE to E.",
    ],
    image:
      "https://images.unsplash.com/photo-1505118380757-91f5f5632de0?auto=format&fit=crop&w=800&q=80",
  },
  {
    id: 4,
    author: "GMS Grenada",
    time: "May 15 at 8:11 pm",
    paragraphs: [
      "Carriacou and Petite Martinique could experience some of the strongest winds this weekend.",
      "Gusts of up to 30 mph are possible from Friday evening through Saturday morning. Secure loose outdoor items.",
    ],
    image:
      "https://images.unsplash.com/photo-1527482797697-8795b05a13fe?auto=format&fit=crop&w=800&q=80",
  },
];

function PostCard({ post }: { post: (typeof posts)[number] }) {
  return (
    <div className="flex flex-col rounded-xl border border-gm-border bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gm-sky font-bold text-sm text-white">
            G
          </div>
          <div>
            <p className="font-semibold text-gm-navy text-sm">{post.author}</p>
            <p className="text-gray-400 text-xs">{post.time}</p>
          </div>
        </div>
        <button
          className="shrink-0 text-gray-400 hover:text-gray-600"
          type="button"
        >
          •••
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {post.paragraphs.map((p) => (
          <p className="text-gray-700 text-sm leading-relaxed" key={p}>
            {p}
          </p>
        ))}
      </div>

      <div className="mt-3 overflow-hidden rounded-lg bg-gray-100">
        <Image
          alt=""
          className="h-44 w-full object-cover"
          height={176}
          src={post.image}
          width={400}
        />
      </div>
    </div>
  );
}

export function GmsNews() {
  return (
    <section className="mb-4">
      <div className="flex items-center justify-between px-4 lg:px-0">
        <h2 className="font-bold text-gm-navy text-lg lg:text-xl">
          Latest from us
        </h2>
        <a
          className="font-medium text-gm-blue text-sm hover:underline"
          href="/news"
        >
          See more
        </a>
      </div>

      {/* Mobile: horizontal scroll carousel → Desktop: 4-col grid */}
      <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] lg:grid lg:grid-cols-4 lg:gap-4 lg:overflow-visible lg:px-0 lg:pb-0">
        {posts.map((post) => (
          <div className="w-[85vw] shrink-0 lg:w-auto" key={post.id}>
            <PostCard post={post} />
          </div>
        ))}
      </div>
    </section>
  );
}
