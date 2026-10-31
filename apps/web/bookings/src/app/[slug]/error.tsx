"use client";

import {
  BARRELS_SUPPORT_EMAIL,
  BARRELS_SUPPORT_HREF,
} from "@barrelsgd/ui/lib/support";

export default function BusinessError({ reset }: { reset: () => void }) {
  return (
    <section className="space-y-4">
      <h1 className="font-semibold text-2xl">
        Online booking is taking a break
      </h1>
      <p className="text-muted-foreground">
        We couldn't load this booking page. Try again in a moment, or contact
        the business directly. If the fault is with Barrels Bookings itself,
        email{" "}
        <a
          className="text-foreground underline underline-offset-4"
          href={BARRELS_SUPPORT_HREF}
        >
          {BARRELS_SUPPORT_EMAIL}
        </a>
        .
      </p>
      <button className="btn btn-solid" onClick={reset} type="button">
        Try again
      </button>
    </section>
  );
}
