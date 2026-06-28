import Link from "next/link";
import { ArticleMeta } from "@/components/article-meta";
import { Eyebrow } from "@/components/eyebrow";

export interface StoryListItemProps {
  author: string;
  eyebrow: string;
  href: string;
  publishedAt: string;
  title: string;
}

export function StoryListItem({
  href,
  eyebrow,
  title,
  author,
  publishedAt,
}: StoryListItemProps) {
  return (
    <article className="flex flex-col gap-1.5 border-signal-rule border-b py-4 first:pt-0 last:border-b-0">
      <Eyebrow>{eyebrow}</Eyebrow>
      <Link href={href}>
        <h3 className="font-semibold font-serif text-lg leading-snug hover:text-signal-green">
          {title}
        </h3>
      </Link>
      <ArticleMeta author={author} publishedAt={publishedAt} />
    </article>
  );
}
