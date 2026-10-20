"use client";

import { BOOKING_URL, INSTAGRAM_DM_URL } from "@/data/site";

// Online booking depends on the booking service. When it is down, the Acuity
// page still works, so offer it.
export default function BookError({ reset }: { reset: () => void }) {
  return (
    <section className="block">
      <div className="wrap book-wrap">
        <h1>Online booking is taking a break</h1>
        <p className="lede">
          We couldn't load the booking page. You can try again, book on our
          other booking page, or message us on Instagram.
        </p>
        <p className="actions">
          <button className="btn btn-solid" onClick={reset} type="button">
            Try again
          </button>
          <a className="btn btn-ghost" href={BOOKING_URL} rel="noopener">
            Book on our other page
          </a>
          <a className="btn btn-ghost" href={INSTAGRAM_DM_URL} rel="noopener">
            Message us
          </a>
        </p>
      </div>
    </section>
  );
}
