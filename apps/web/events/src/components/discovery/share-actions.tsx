"use client";

import { Button, buttonVariants } from "@barrelsgd/ui/components/ui/button";
import { cn } from "@barrelsgd/ui/lib/utils";
import { CalendarPlus, Link2, MessageCircle } from "lucide-react";
import { useState } from "react";

/**
 * WhatsApp is how events spread in Grenada, so it leads. `url` is the event's
 * full https address, built on the server from the public site URL: a share
 * text with a bare path has no link anyone can open.
 */
export function ShareActions({
  icsHref,
  title,
  url,
}: {
  icsHref: string;
  title: string;
  url: string;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
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
        href={whatsappHref(title, url)}
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

/** The WhatsApp share link for an event: the title, then the full address. */
export function whatsappHref(title: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`${title} ${url}`)}`;
}
