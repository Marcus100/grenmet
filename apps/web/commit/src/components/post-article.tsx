import { cn } from "@barrelsgd/ui/lib/utils";
import { MDXContent } from "@content-collections/mdx/react";
import type { ComponentPropsWithoutRef } from "react";
import { FormattedDate } from "@/components/formatted-date";
import type { Post } from "@/lib/content";

function ContentWrapper({
  className,
  ...props
}: ComponentPropsWithoutRef<"div">) {
  return (
    <div className="mx-auto max-w-7xl px-6 lg:flex lg:px-8">
      <div className="lg:ml-96 lg:flex lg:w-full lg:justify-end lg:pl-32">
        <div
          className={cn(
            "mx-auto max-w-lg lg:mx-0 lg:w-0 lg:max-w-xl lg:flex-auto",
            className
          )}
          {...props}
        />
      </div>
    </div>
  );
}

function PostHeader({ post }: { post: Post }) {
  const anchor = `#${post.slug}`;
  return (
    <header className="relative mb-10 xl:mb-0">
      <div className="pointer-events-none absolute top-0 left-[max(-0.5rem,calc(50%-18.625rem))] z-50 flex h-4 items-center justify-end gap-x-2 lg:right-[calc(max(2rem,50%-38rem)+40rem)] lg:left-0 lg:min-w-lg xl:h-8">
        <a className="inline-flex" href={anchor}>
          <FormattedDate
            className="hidden xl:pointer-events-auto xl:block xl:font-medium xl:text-2xs/4 xl:text-white/50"
            date={post.date}
          />
        </a>
        <div className="h-0.25 w-3.5 bg-gray-400 lg:-mr-3.5 xl:mr-0 xl:bg-gray-300" />
      </div>
      <ContentWrapper>
        <div className="flex items-center gap-x-3">
          <a className="inline-flex xl:hidden" href={anchor}>
            <FormattedDate
              className="font-medium text-2xs/4 text-gray-500 xl:hidden dark:text-white/50"
              date={post.date}
            />
          </a>
          {post.release ? (
            <span className="rounded-full bg-sky-500/10 px-2 font-medium text-2xs/5 text-sky-700 ring-1 ring-sky-500/20 ring-inset dark:text-sky-300">
              v{post.release}
            </span>
          ) : null}
        </div>
      </ContentWrapper>
    </header>
  );
}

export function PostArticle({ post }: { post: Post }) {
  return (
    <article className="scroll-mt-16" id={post.slug}>
      <PostHeader post={post} />
      <ContentWrapper className="typography">
        <h2>
          <a href={`#${post.slug}`}>{post.title}</a>
        </h2>
        <MDXContent code={post.body} />
      </ContentWrapper>
    </article>
  );
}
