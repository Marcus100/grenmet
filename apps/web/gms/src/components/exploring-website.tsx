import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const RELATED_LINKS = [
  { href: "/sectiors/marine", label: "Marine and coastal waters" },
  { href: "/sectors/aviation", label: "Aviation forecasts" },
  { href: "/resources/hurricane", label: "Hurricane preparedness" },
  { href: "/climate/data-request", label: "Climate data and requests" },
];

export function ExploringWebsite() {
  return (
    <div className="flex gap-20 py-16">
      <div className="flex w-175 flex-none flex-col items-start gap-5 rounded-md bg-gm-navy p-11 text-gm-text-inverse">
        <span className="font-bold text-heading-md leading-heading-md">
          Exploring this website
        </span>
        <p className="text-body-base text-gm-text-inverse/85 leading-body-base">
          Find information to help you read the warning levels, the hourly
          forecast and the other features of this site.
        </p>
        <Link
          className="rounded-md bg-background px-6.5 py-3.5 font-bold text-body-base text-gm-navy leading-body-base"
          href="/help"
        >
          Website help
        </Link>
      </div>
      <div className="flex flex-1 flex-col">
        <span className="pb-5 font-bold text-gm-text-primary text-heading-sm leading-heading-sm">
          You may also be interested in
        </span>
        {RELATED_LINKS.map((link, i) => (
          <Link
            className={cn(
              "flex items-center justify-between border-gm-border border-t py-5 font-semibold text-gm-blue text-nav leading-nav",
              i === RELATED_LINKS.length - 1 && "border-b"
            )}
            href={link.href}
            key={link.href}
          >
            {link.label}
            <ChevronRightIcon aria-hidden="true" className="size-5" />
          </Link>
        ))}
      </div>
    </div>
  );
}
