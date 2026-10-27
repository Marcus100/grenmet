import type { Metadata } from "next";
import { PageHead } from "@/components/sections";
import { ServiceMenu } from "@/components/service-menu";
import { CONSULTATION_PRICE, formatPrice } from "@/data/site";
import { siteBookingLink } from "@/lib/book-link";

export const metadata: Metadata = {
  title: "Services and prices",
  description:
    "Lash extensions, brow lamination, brow sculpting, custom facials and waxing in St. George's, Grenada, with prices.",
  alternates: { canonical: "/services" },
};

const LASH_CALENDAR = [
  {
    step: "Consultation",
    when: "Before day one",
    detail: "Goals, sensitivities and the style that suits your eyes.",
  },
  {
    step: "Full set",
    when: "Day one",
    detail: "Classic, hybrid or volume, applied lash by lash.",
  },
  {
    step: "Touch-up",
    when: "Week one",
    detail: "A quick pass to settle fullness after the first shed.",
  },
  {
    step: "Refill",
    when: "Weeks two to three",
    detail: "Come in while at least 40% of your extensions remain.",
  },
];

export default function ServicesPage() {
  const booking = siteBookingLink();
  return (
    <>
      <PageHead
        accent="& skin"
        eyebrow="Service menu"
        lede={`Every first visit starts with a ${formatPrice(CONSULTATION_PRICE)} new client consultation. After that, book any service below.`}
        title="Lashes, brows"
      />
      <section className="flush-top block">
        <div className="wrap">
          <div className="menu-card">
            <ServiceMenu booking={booking} />
            <div className="menu-foot">
              <span>
                Prices as listed on our booking page. By appointment only.
              </span>
              <a className="btn btn-solid" {...booking}>
                Choose a time
              </a>
            </div>
          </div>
        </div>
      </section>
      <section className="band block">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">Lash care</p>
            <h2>Your lash calendar</h2>
            <p className="muted">
              Extensions shed with your natural lash cycle. This rhythm keeps
              them full.
            </p>
          </div>
          <ol className="timeline">
            {LASH_CALENDAR.map((item) => (
              <li key={item.step}>
                <h3>{item.step}</h3>
                <span className="when">{item.when}</span>
                <p>{item.detail}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>
    </>
  );
}
