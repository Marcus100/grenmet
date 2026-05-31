import Image from "next/image";

const posts = [
  {
    id: 1,
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
    <div className="flex flex-col gap-gm-12 rounded-gm-8 border border-gm-border bg-background p-gm-16 shadow-gm-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-gm-12">
          <div className="flex size-gm-40 shrink-0 items-center justify-center rounded-full bg-gm-sky font-bold text-gm-body text-gm-text-inverse">
            G
          </div>
          <div className="flex flex-col">
            <p className="font-semibold text-gm-body-sm text-gm-navy leading-gm-body-sm">
              GMS
            </p>
            <p className="text-gm-label text-gm-text-muted leading-gm-label">
              {post.time}
            </p>
          </div>
        </div>
        <p className="text-base text-gm-text-muted leading-6">•••</p>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-gm-8">
        {post.paragraphs.map((p) => (
          <p
            className="text-gm-body-sm text-gm-text-secondary leading-gm-body-sm"
            key={p}
          >
            {p}
          </p>
        ))}
      </div>

      {/* Image */}
      <div className="overflow-hidden rounded-gm-8 bg-gm-surface">
        <Image
          alt=""
          className="h-[200px] w-full object-cover"
          height={200}
          src={post.image}
          width={280}
        />
      </div>
    </div>
  );
}

export function GmsNews() {
  return (
    <section className="mb-4">
      <div className="mb-2.5 flex items-center justify-between">
        <h2 className="font-bold text-gm-heading-sm text-gm-navy leading-gm-heading-sm">
          Latest from us
        </h2>
        <a
          className="font-medium text-gm-blue text-gm-body leading-gm-body"
          href="/news"
        >
          See more
        </a>
      </div>

      <div className="flex gap-gm-12 overflow-x-auto [scrollbar-width:none] lg:grid lg:grid-cols-4 lg:overflow-visible">
        {posts.map((post) => (
          <div className="w-75 shrink-0 lg:w-auto" key={post.id}>
            <PostCard post={post} />
          </div>
        ))}
      </div>
    </section>
  );
}
