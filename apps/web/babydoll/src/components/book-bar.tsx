import { BOOKING_URL, BUSINESS } from "@/data/site";

/** Fixed booking bar, shown on phones only (see .book-bar in globals.css). */
export function BookBar() {
  return (
    <section aria-label="Book an appointment" className="book-bar">
      <div className="book-bar-info">
        <b>{BUSINESS.name}</b>
        <small>{BUSINESS.appointmentOnly}</small>
      </div>
      <a
        className="btn btn-solid"
        href={BOOKING_URL}
        rel="noopener"
        target="_blank"
      >
        Book me
      </a>
    </section>
  );
}
