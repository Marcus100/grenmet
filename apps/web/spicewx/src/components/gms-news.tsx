import Image from "next/image";

const posts = [
  {
    id: 1,
    author: "GMS Grenada",
    time: "Yesterday 10:41 am",
    body: "Partly cloudy conditions persist across Grenada with isolated showers expected through the afternoon. Temperatures remain near seasonal norms.",
    image: null as string | null,
  },
  {
    id: 2,
    author: "GMS Grenada",
    time: "15 May, 10:38 pm",
    body: "What will the weather look like after 17 May? The week begins with high pressure building from the north bringing drier and warmer conditions.",
    image: null as string | null,
  },
];

export function GmsNewsDesktop() {
  return (
    <section className="px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-bold text-gm-navy text-lg">Latest from GMS</h2>
        <a className="font-medium text-gm-blue text-sm" href="/news">
          See all
        </a>
      </div>

      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
        {posts.map((post) => (
          <div
            className="w-72 shrink-0 rounded-2xl border border-gm-border bg-white p-4 shadow-sm"
            key={post.id}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gm-blue font-bold text-white text-xs">
                  G
                </div>
                <div>
                  <p className="font-semibold text-gm-navy text-sm">
                    {post.author}
                  </p>
                  <p className="text-gray-400 text-xs">{post.time}</p>
                </div>
              </div>
              <button className="text-gray-400" type="button">
                •••
              </button>
            </div>

            <p className="text-gray-700 text-sm leading-relaxed">{post.body}</p>

            {post.image && (
              <div className="mt-3 overflow-hidden rounded-xl bg-gray-100">
                <Image
                  alt=""
                  className="h-40 w-full object-cover"
                  height={160}
                  src={post.image}
                  width={400}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

export function GmsNewsMobile() {
  return (
    <section className="border=grey-300 mb-4 border px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-bold text-gm-navy text-lg">Latest from GMS</h2>
        <a className="font-medium text-gm-blue text-sm" href="/news">
          See all
        </a>
      </div>

      <div className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-2">
        {posts.map((post) => (
          <div
            className="w-72 shrink-0 rounded-2xl border border-gm-border bg-white p-4 shadow-sm"
            key={post.id}
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gm-blue font-bold text-white text-xs">
                  G
                </div>
                <div>
                  <p className="font-semibold text-gm-navy text-sm">
                    {post.author}
                  </p>
                  <p className="text-gray-400 text-xs">{post.time}</p>
                </div>
              </div>
              <button className="text-gray-400" type="button">
                •••
              </button>
            </div>

            <p className="text-gray-700 text-sm leading-relaxed">{post.body}</p>

            {post.image && (
              <div className="mt-3 overflow-hidden rounded-xl bg-gray-100">
                <Image
                  alt=""
                  className="h-40 w-full object-cover"
                  height={160}
                  src={post.image}
                  width={400}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
