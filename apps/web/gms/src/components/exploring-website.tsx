import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

const RELATED_LINKS = [
  { href: "/sectors/marine", label: "Marine and coastal waters" },
  { href: "/sectors/aviation", label: "Aviation forecasts" },
  { href: "/resources/hurricane", label: "Hurricane preparedness" },
  { href: "/climate/data-request", label: "Climate data and requests" },
];

export function ExploringWebsite() {
  return (
    // Stacks on mobile, side-by-side once there is room for the fixed-width card.
    <div className="flex flex-col gap-8 py-10 md:flex-row md:items-start md:gap-10 lg:gap-20 lg:py-16">
      <div className="flex flex-col items-start gap-5 rounded-md bg-gm-navy p-7 text-gm-text-inverse md:flex-1 lg:w-150 lg:min-w-0 lg:flex-initial lg:p-11">
        <span className="font-bold text-heading-sm leading-heading-sm lg:text-heading-md lg:leading-heading-md">
          GMS Weather app
        </span>
        <p className="text-body-base text-gm-text-inverse/85 leading-body-base">
          Stay informed with the GMS mobile app, including warnings, forecasts
          and updates wherever you are.
        </p>
        <Link
          className="rounded-md bg-background px-6.5 py-3.5 font-bold text-body-base text-gm-navy leading-body-base"
          href="/app-guide"
        >
          Learn about the app
        </Link>
      </div>
      <div className="flex min-w-80 flex-1 flex-col">
        <span className="whitespace-nowrap pb-5 font-bold text-gm-text-primary text-heading-sm leading-heading-sm">
          You may also be interested in
        </span>
        {RELATED_LINKS.map((link, i) => (
          <Link
            className={cn(
              "flex items-center justify-between gap-4 border-gm-border border-t py-5 font-semibold text-body-base text-gm-blue-ink leading-body-base lg:text-nav lg:leading-nav",
              i === RELATED_LINKS.length - 1 && "border-b"
            )}
            href={link.href}
            key={link.href}
          >
            {link.label}
            <ChevronRightIcon aria-hidden="true" className="size-5 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}
