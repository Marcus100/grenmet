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
    <div className="flex flex-col gap-[12px] rounded-[12px] border border-[#d0d5dd] bg-white p-[17px] shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-[12px]">
          <div className="flex size-[40px] shrink-0 items-center justify-center rounded-full bg-[#39a5f5] font-bold text-[14px] text-white">
            G
          </div>
          <div className="flex flex-col">
            <p className="font-semibold text-[#150068] text-[13px] leading-[18px]">
              GMS
            </p>
            <p className="text-[#99a1af] text-[11px] leading-[16px]">
              {post.time}
            </p>
          </div>
        </div>
        <p className="text-[#99a1af] text-[16px] leading-[24px]">•••</p>
      </div>

      {/* Body */}
      <div className="flex flex-col gap-[8px]">
        {post.paragraphs.map((p) => (
          <p className="text-[#364153] text-[13px] leading-[20px]" key={p}>
            {p}
          </p>
        ))}
      </div>

      {/* Image */}
      <div className="overflow-hidden rounded-[8px] bg-[#f3f4f6]">
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
      <div className="mb-[10px] flex items-center justify-between">
        <h2 className="font-bold text-[#150068] text-[18px] leading-[24px]">
          Latest from us
        </h2>
        <a
          className="font-medium text-[#2478f2] text-[14px] leading-[20px]"
          href="/news"
        >
          See more
        </a>
      </div>

      <div className="flex gap-[12px] overflow-x-auto [scrollbar-width:none] lg:grid lg:grid-cols-4 lg:overflow-visible">
        {posts.map((post) => (
          <div className="w-75 shrink-0 lg:w-auto" key={post.id}>
            <PostCard post={post} />
          </div>
        ))}
      </div>
    </section>
  );
}
