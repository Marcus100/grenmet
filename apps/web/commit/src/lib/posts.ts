// Pure helpers over the generated posts collection, kept free of the
// `content-collections` import so tests can feed them fixtures.

export interface PostSummary {
  readonly date: string;
  readonly draft: boolean;
  readonly release?: string;
  readonly slug: string;
  readonly summary: string;
  readonly title: string;
}

/** Published posts, newest first; same-day posts keep a stable slug order. */
export function publishedPosts<T extends PostSummary>(
  posts: readonly T[]
): T[] {
  return posts
    .filter((post) => !post.draft)
    .toSorted(
      (a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug)
    );
}
