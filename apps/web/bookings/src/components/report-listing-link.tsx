import { reportListingHref } from "@/lib/report-listing";

/** Quiet link at the foot of a business page; opens a mail to Barrels support. */
export function ReportListingLink({ slug }: Readonly<{ slug: string }>) {
  return (
    <p className="text-muted-foreground text-sm">
      <a
        className="brand-link inline-flex min-h-11 items-center underline underline-offset-4"
        href={reportListingHref(slug)}
      >
        Report this listing
      </a>
    </p>
  );
}
