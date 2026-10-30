import { PostArticle } from "@/components/post-article";
import { SiteLayout } from "@/components/site-layout";
import { getPosts } from "@/lib/content";

export default function Home() {
  return (
    <SiteLayout>
      {getPosts().map((post) => (
        <PostArticle key={post.slug} post={post} />
      ))}
    </SiteLayout>
  );
}
