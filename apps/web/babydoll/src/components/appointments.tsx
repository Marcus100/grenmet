import { NewTabNote } from "@/components/new-tab-note";
import { APPOINTMENTS, BUSINESS } from "@/data/site";
import { siteBookingLink } from "@/lib/book-link";

/** The appointment-only block shown on the contact page and the visit band. */
export function Appointments() {
  return (
    <>
      <span className="appt">{BUSINESS.appointmentOnly}</span>
      <p className="appointment-note">{APPOINTMENTS.note}</p>
      <a className="btn" {...siteBookingLink()}>
        {APPOINTMENTS.action}
        <NewTabNote />
      </a>
    </>
  );
}

export function Address() {
  return (
    <address>
      {BUSINESS.address.map((line, index) => (
        <span key={line}>
          {index > 0 && <br />}
          {line}
        </span>
      ))}
    </address>
  );
}
