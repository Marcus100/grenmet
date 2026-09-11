"use client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { ProductPost } from "@/lib/editorial";
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
      {mobileCarousel ? <DesktopUpdates onShare={share} posts={posts} /> : null}
      {status ? (
        <p className="text-sm" role="status">
          {status}
        </p>
      ) : null}
      <div
        className={
          mobileCarousel
            ? "grid gap-4 max-lg:flex max-lg:snap-x max-lg:snap-mandatory max-lg:items-start max-lg:gap-4 max-lg:overflow-x-auto max-lg:pb-3 md:grid-cols-2 lg:hidden max-lg:[scrollbar-width:none]"
            : "grid gap-4 md:grid-cols-2"
        }
      >
        {posts.map((post, index) => (
          <article
            className={`space-y-4 rounded-lg border border-gm-border bg-background p-5 ${mobileCarousel ? "max-lg:w-[84%] max-lg:shrink-0 max-lg:snap-start max-lg:space-y-5 max-lg:rounded-2xl max-lg:border-0 max-lg:p-5 max-lg:shadow-card" : ""} ${index === 0 ? "md:col-span-2" : ""}`}
            key={post.id}
          >
            <header className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-full bg-gm-blue-ink font-bold text-gm-text-inverse">
                G
              </span>
              <div>
                <p className="font-semibold">
                  {mobileCarousel ? (
                    <>
                      <span className="lg:hidden">GMS forecasters</span>
                      <span className="hidden lg:inline">
                        GMS · From the forecast desk
                      </span>
                    </>
                  ) : (
                    "GMS · From the forecast desk"
                  )}
                </p>
                <p className="text-muted-foreground text-sm">
                  {post.issuedAt.replace("T", " ")} AST
                </p>
              </div>
            </header>
            <h3 className="font-bold text-xl">
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
            <p className="text-muted-foreground text-xs">
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

function DesktopUpdates({
  posts,
  onShare,
}: {
  posts: ProductPost[];
  onShare: (post: ProductPost) => Promise<void>;
}) {
  return (
    <div className="hidden lg:grid lg:grid-cols-4 lg:gap-6">
      {posts.map((post, index) => (
        <article
          className={
            index === 0
              ? "col-span-2 row-span-2 flex flex-col overflow-hidden rounded-lg border border-gm-border bg-background"
              : "flex flex-col overflow-hidden rounded-lg border border-gm-border bg-background"
          }
          key={post.id}
        >
          <Link
            aria-label={`Read ${post.title}`}
            className="relative block shrink-0"
            href={post.href}
          >
            <Image
              alt=""
              className={
                index === 0
                  ? "h-75 w-full object-cover"
                  : "h-30 w-full object-cover"
              }
              height={500}
              sizes={index === 0 ? "50vw" : "25vw"}
              src={post.imageUrl}
              width={800}
            />
          </Link>
          <div
            className={
              index === 0
                ? "flex flex-1 flex-col gap-4 p-6"
                : "flex flex-1 flex-col gap-3 p-4"
            }
          >
            <p className="font-semibold text-gm-text-muted text-xs uppercase">
              {post.issuedAt.replace("T", " ")} AST
            </p>
            <Link
              className={
                index === 0
                  ? "text-gm-text-primary text-lg leading-relaxed"
                  : "text-gm-text-primary text-sm leading-relaxed"
              }
              href={post.href}
            >
              {post.summary}
            </Link>
            <Button
              onClick={() => onShare(post)}
              type="button"
              variant="outline"
            >
              Share update
            </Button>
            {index === 0 ? (
              <Link
                className="mt-auto pt-6 font-semibold text-gm-blue-ink"
                href={post.href}
              >
                Read more <span aria-hidden="true">→</span>
              </Link>
            ) : null}
          </div>
        </article>
      ))}
    </div>
  );
}
