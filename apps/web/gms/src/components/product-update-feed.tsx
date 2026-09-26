"use client";
import { Logo } from "@barrelsgd/gms/components/logo";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@barrelsgd/ui/components/ui/dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ProductPost } from "@/lib/editorial";
import { cn } from "@/lib/utils";

export function ProductUpdateFeed({
  posts,
  mobileCarousel = false,
}: {
  posts: ProductPost[];
  mobileCarousel?: boolean;
}) {
  const [status, setStatus] = useState("");
  async function share(post: ProductPost) {
    const url = new URL(post.href, window.location.origin).toString();
    const text = `${post.title}\nGMS · ${post.issuedAt.replace("T", " ")} AST\n${post.paragraphs.join("\n\n")}${post.reference ? "\nBased on the supplied September 8, 2026 report; check GMS for current information." : ""}`;
    try {
      if (navigator.share)
        await navigator.share({ title: post.title, text, url });
      else {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setStatus("Update and link copied for sharing.");
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setStatus("Sharing was unavailable. Open the update to copy its text.");
    }
  }
  return (
    <div className="space-y-4">
      {status ? (
        <p className="text-body leading-body" role="status">
          {status}
        </p>
      ) : null}
      {mobileCarousel ? <DesktopFeed onShare={share} posts={posts} /> : null}
      <div
        className={
          mobileCarousel
            ? "grid gap-4 max-lg:flex max-lg:snap-x max-lg:snap-mandatory max-lg:items-start max-lg:gap-4 max-lg:overflow-x-auto max-lg:pb-3 md:grid-cols-2 lg:hidden max-lg:[scrollbar-width:none]"
            : "grid gap-4 md:grid-cols-2"
        }
      >
        {posts.map((post, index) => (
          <article
            className={cn(
              "space-y-4 rounded-lg border border-gm-border bg-background p-5",
              mobileCarousel &&
                "max-lg:w-[84%] max-lg:shrink-0 max-lg:snap-start max-lg:space-y-5 max-lg:rounded-2xl max-lg:border-0 max-lg:p-5 max-lg:shadow-card md:max-lg:w-[45%]",
              index === 0 && "md:col-span-2"
            )}
            key={post.id}
          >
            <header className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-gm-blue-ink font-bold text-gm-text-inverse">
                G
              </span>
              <div>
                <p className="font-semibold">
                  {mobileCarousel
                    ? "GMS forecasters"
                    : "GMS · From the forecast desk"}
                </p>
                <p className="text-body-sm text-gm-text-muted leading-body-sm">
                  {post.issuedAt.replace("T", " ")} AST
                </p>
              </div>
            </header>
            <h3 className="font-bold text-gm-navy text-nav leading-nav">
              <Link href={post.href}>{post.title}</Link>
            </h3>
            {mobileCarousel ? (
              <p className="line-clamp-4 text-gm-text-secondary">
                {post.summary}
              </p>
            ) : (
              <div className="space-y-4 text-gm-text-secondary">
                {post.paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            )}
            <Link
              aria-label={`Read ${post.title}`}
              className="relative block overflow-hidden rounded-xl"
              href={post.href}
            >
              <Image
                alt=""
                className="aspect-[4/3] w-full object-cover lg:aspect-[16/9] lg:max-h-72"
                height={600}
                sizes="(min-width: 768px) 50vw, 80vw"
                src={post.imageUrl}
                width={800}
              />
              <span className="absolute right-2 bottom-2 rounded bg-black/60 px-2 py-1 text-[10px] text-white">
                Illustrative image
              </span>
            </Link>
            <p className="text-caption text-gm-text-muted leading-caption">
              {post.source}
              {post.reference ? " · Supplied report, 8 September 2026" : ""}
            </p>
            <div className="flex items-center justify-between gap-3">
              <Link
                className="font-semibold text-gm-blue-ink underline"
                href={post.href}
              >
                Open update
              </Link>
              <Button
                onClick={() => share(post)}
                type="button"
                variant="outline"
              >
                Share update
              </Button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

/**
 * Desktop rendering for the homepage feed — a plain feed card per post
 * (source, body, image), matching the reference "Latest from the
 * meteorologists" design rather than the magazine treatment the mobile
 * carousel and the standalone update page use.
 */
function DesktopFeed({
  posts,
  onShare,
}: {
  posts: ProductPost[];
  onShare: (post: ProductPost) => Promise<void>;
}) {
  return (
    <div className="hidden lg:grid lg:grid-cols-4 lg:gap-6">
      {posts.slice(0, 4).map((post) => (
        <article
          className="flex flex-col gap-3 rounded-xl border border-gm-border bg-background p-4"
          key={post.id}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2.5">
              <Logo className="size-10 shrink-0" variant="submark" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-body-base text-gm-text-primary leading-body-base">
                  GMS · From the forecast desk
                </p>
                <p className="text-body-sm text-gm-text-muted leading-body-sm">
                  {post.issuedAt.replace("T", " ")} AST
                </p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    aria-label={`Actions for ${post.title}`}
                    size="icon-sm"
                    variant="ghost"
                  />
                }
              >
                <MoreHorizontal aria-hidden="true" className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => onShare(post)}>
                  Share update
                </DropdownMenuItem>
                <DropdownMenuItem render={<Link href={post.href} />}>
                  Open update
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <div className="flex flex-col gap-1">
            <Link
              className="font-bold text-body-base text-gm-text-primary leading-body-base"
              href={post.href}
            >
              {post.title}
            </Link>
            <p className="text-body-base text-gm-text-secondary leading-body-base">
              {post.summary}
            </p>
          </div>
          <Link
            aria-label={`Read ${post.title}`}
            className="relative mt-auto block overflow-hidden rounded-lg"
            href={post.href}
          >
            <Image
              alt=""
              className="aspect-[4/3] w-full object-cover"
              height={600}
              sizes="25vw"
              src={post.imageUrl}
              width={800}
            />
          </Link>
        </article>
      ))}
    </div>
  );
}
