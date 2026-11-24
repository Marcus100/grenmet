import Link from "next/link";
import { CopyLinkButton } from "@/components/studio/copy-link-button";
import { CARD, SECONDARY_ACTION } from "@/components/studio/studio-ui";

interface BookingAddressProps {
  /** The studio slug: the address staff use, /studio/<slug>. */
  orgSlug: string;
  /** The public slug: the address customers open, /<slug>. */
  publicSlug: string;
  /** This app's public origin (NEXT_PUBLIC_SITE_URL). Unset: the path only. */
  siteOrigin: string | undefined;
}

/**
 * The customers' booking address, with the difference from the studio address
 * spelled out: the two slugs can differ, and only the public one is shared.
 */
export function BookingAddress({
  orgSlug,
  publicSlug,
  siteOrigin,
}: Readonly<BookingAddressProps>) {
  const path = `/${publicSlug}`;
  const shown = siteOrigin ? `${new URL(siteOrigin).host}${path}` : path;

  return (
    <section
      aria-labelledby="booking-address-heading"
      className={`${CARD} space-y-3`}
    >
      <div className="space-y-1">
        <h2 className="text-base font-semibold" id="booking-address-heading">
          Your booking page
        </h2>
        <p className="font-medium break-all">
          Customers book at <code className="font-mono">{shown}</code>
        </p>
        <p className="text-muted-foreground text-sm">
          Share this address. Your studio address,{" "}
          <code>/studio/{orgSlug}</code>, is for staff only. The two names can
          differ.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link className={SECONDARY_ACTION} href={{ pathname: path }}>
          View my page
        </Link>
        <CopyLinkButton origin={siteOrigin} path={path} />
      </div>
    </section>
  );
}
