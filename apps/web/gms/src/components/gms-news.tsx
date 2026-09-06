import { ChevronRightIcon } from "lucide-react";
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
  {
    id: 5,
    time: "May 14 at 4:20 pm",
    paragraphs: [
      "August rainfall totals across the tri-island state came in close to the long-term average, ending a dry three-month run.",
    ],
    image:
      "https://images.unsplash.com/photo-1428592953211-077101b2021b?auto=format&fit=crop&w=800&q=80",
  },
];

function PostCard({ post }: { post: (typeof posts)[number] }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-gm-border bg-background p-4 shadow-card">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gm-sky font-bold text-body text-gm-text-inverse">
            G
          </div>
          <div className="flex flex-col">
            <p className="font-semibold text-body-sm text-gm-navy leading-body-sm">
              GMS
            </p>
            <p className="text-gm-text-muted text-label leading-label">
              {post.time}
            </p>
          </div>
        </div>
        <p className="text-base text-gm-text-muted leading-6">•••</p>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2">
        {post.paragraphs.map((p) => (
          <p
            className="text-body-sm text-gm-text-secondary leading-body-sm"
            key={p}
          >
            {p}
          </p>
        ))}
      </div>

      {/* Image */}
      <div className="overflow-hidden rounded-lg bg-gm-surface">
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

function LeadPostCard({ post }: { post: (typeof posts)[number] }) {
  return (
    <div className="col-span-2 row-span-2 flex flex-col overflow-hidden rounded-lg border border-gm-border bg-background">
      <div className="relative h-75 shrink-0 bg-gm-surface">
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="(min-width: 1024px) 50vw, 100vw"
          src={post.image}
        />
      </div>
      <div className="flex flex-1 flex-col gap-3 p-6">
        <span className="font-bold text-caption text-gm-text-muted uppercase leading-caption tracking-wide">
          {post.time}
        </span>
        <p className="text-body-base text-gm-text-primary leading-body-base">
          {post.paragraphs[0]}
        </p>
        <span className="mt-auto flex items-center gap-1.5 font-semibold text-body text-gm-blue leading-body">
          Read more
          <ChevronRightIcon aria-hidden="true" className="size-4" />
        </span>
      </div>
    </div>
  );
}

function SecondaryPostCard({ post }: { post: (typeof posts)[number] }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-gm-border bg-background">
      <div className="relative h-30 shrink-0 bg-gm-surface">
        <Image
          alt=""
          className="object-cover"
          fill
          sizes="(min-width: 1024px) 25vw, 100vw"
          src={post.image}
        />
      </div>
      <div className="flex flex-col gap-2 p-4">
        <span className="font-bold text-gm-text-muted text-label uppercase leading-label tracking-wide">
          {post.time}
        </span>
        <p className="text-body-sm text-gm-text-primary leading-body-sm">
          {post.paragraphs[0]}
        </p>
      </div>
    </div>
  );
}

export function GmsNews() {
  const [lead, ...rest] = posts;

  return (
    <section className="mb-4 lg:mb-8">
      <div className="mb-2.5 flex items-center justify-between lg:mb-5">
        <h2 className="font-bold text-gm-navy text-heading-sm leading-heading-sm lg:text-heading-md lg:leading-heading-md">
          Latest from us
        </h2>
        <a
          className="font-medium text-body text-gm-blue leading-body"
          href="/news"
        >
          See more
        </a>
      </div>

      {/* Mobile: horizontal scroll of equal cards */}
      <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] lg:hidden">
        {posts.map((post) => (
          <div className="w-75 shrink-0" key={post.id}>
            <PostCard post={post} />
          </div>
        ))}
      </div>

      {/* Desktop: one lead post spanning 2x2, the rest as compact cards */}
      <div className="hidden lg:grid lg:grid-cols-4 lg:gap-6">
        {lead && <LeadPostCard post={lead} />}
        {rest.map((post) => (
          <SecondaryPostCard key={post.id} post={post} />
        ))}
      </div>
    </section>
  );
}
