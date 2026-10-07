"use client";

import { Button, buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { CalendarPlus, Link2, MessageCircle } from "lucide-react";
import { useState } from "react";

/** WhatsApp is how events spread in Grenada, so it leads. */
export function ShareActions({
  icsHref,
  path,
  title,
}: {
  icsHref: string;
  path: string;
  title: string;
}) {
  const [copied, setCopied] = useState(false);

  const absoluteUrl = () =>
    typeof window === "undefined"
      ? path
      : new URL(path, window.location.origin).toString();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(absoluteUrl());
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="grid grid-cols-3 gap-2">
      <a
        className={cn(
          buttonVariants({ variant: "outline", size: "lg" }),
          "h-11"
        )}
        href={`https://wa.me/?text=${encodeURIComponent(`${title} ${path}`)}`}
        onClick={(event) => {
          event.currentTarget.href = `https://wa.me/?text=${encodeURIComponent(`${title} ${absoluteUrl()}`)}`;
        }}
        rel="noopener noreferrer"
        target="_blank"
      >
        <MessageCircle data-icon="inline-start" />
        WhatsApp
      </a>
      <Button className="h-11" onClick={copy} size="lg" variant="outline">
        <Link2 data-icon="inline-start" />
        {copied ? "Copied" : "Copy link"}
      </Button>
      <a
        className={cn(
          buttonVariants({ variant: "outline", size: "lg" }),
          "h-11"
        )}
        download
        href={icsHref}
      >
        <CalendarPlus data-icon="inline-start" />
        Calendar
      </a>
    </div>
  );
}
