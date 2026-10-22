import { BUSINESS } from "@/data/site";
import type { CtaLink } from "@/lib/book-link";

/** Fixed booking bar, shown on phones only (see .book-bar in globals.css). */
export function BookBar({ booking }: { booking: CtaLink }) {
  return (
    <section aria-label="Book an appointment" className="book-bar">
      <div className="book-bar-info">
        <b>{BUSINESS.name}</b>
        <small>{BUSINESS.appointmentOnly}</small>
      </div>
      <a className="btn btn-solid" {...booking}>
        Book me
      </a>
    </section>
  );
}
