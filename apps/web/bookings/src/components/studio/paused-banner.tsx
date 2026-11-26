import Link from "next/link";
import { CARD, CARD_LINK } from "@/components/studio/studio-ui";

/**
 * Shown on every studio page while the business's online booking is paused
 * (`paused_at`, the trial or subscription ended more than 7 days ago). Calm:
 * it says what still works and what renewing does. Owners and admins get the
 * Plan & billing link; a member cannot renew, so they are told who can.
 */
export function PausedBanner({
  canManage,
  orgSlug,
}: Readonly<{ canManage: boolean; orgSlug: string }>) {
  return (
    <section aria-labelledby="paused-title" className={`${CARD} space-y-2`}>
      <h2 className="text-foreground text-lg font-semibold" id="paused-title">
        Online booking is paused
      </h2>
      <p className="text-foreground/80">
        Customers can&apos;t book online right now. Bookings that already stand
        still stand, and the links customers use to change them still work. You
        can still add bookings by hand.
      </p>
      {canManage ? (
        <p className="text-foreground/80">
          Renewing on{" "}
          <Link
            className={CARD_LINK}
            href={{ pathname: `/studio/${orgSlug}/plan` }}
          >
            Plan &amp; billing
          </Link>{" "}
          turns online booking back on.
        </p>
      ) : (
        <p className="text-foreground/80">
          An owner or admin can renew on Plan &amp; billing to turn online
          booking back on.
        </p>
      )}
    </section>
  );
}
