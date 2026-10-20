import Image from "next/image";
import Link from "next/link";
import { ReviewsSection, VisitSection } from "@/components/sections";
import {
  BUSINESS,
  CONSULTATION_PRICE,
  formatPrice,
  PACKAGES,
  RATING,
} from "@/data/site";
import { siteBookingLink } from "@/lib/book-link";

export default function HomePage() {
  const booking = siteBookingLink();
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div>
            <p className="eyebrow">{BUSINESS.tagline}</p>
            <h1>
              Where every doll is treated like <em>royalty.</em>
            </h1>
            <p className="lede">
              Lash extensions, sculpted brows and custom facials, done one
              client at a time by a certified esthetician.
            </p>
            <div className="ctas">
              <a className="btn btn-solid" {...booking}>
                Make an appointment
              </a>
              <Link className="btn btn-ghost" href="/portfolio">
                See our work
              </Link>
            </div>
          </div>
          <div className="badge">
            <Image
              alt="Baby Doll Beauty Bar Grenada monogram"
              height={400}
              priority
              src="/logo.jpg"
              width={400}
            />
            <a
              aria-label={`Rated ${RATING.score} out of 5 from ${RATING.count} client reviews`}
              className="rating"
              href="#reviews"
            >
              <span aria-hidden="true" className="stars">
                ★★★★★
              </span>
              <b>{RATING.score}</b>
              <small>{RATING.count} client reviews</small>
            </a>
          </div>
        </div>
      </section>

      <div className="consult">
        <div className="wrap">
          <span className="tag">New clients</span>
          <p>
            A <strong>new client consultation</strong> is required before any
            first service. We talk through your lash and brow goals, check
            sensitivities, and plan your look.
          </p>
          <span className="price">{formatPrice(CONSULTATION_PRICE)}</span>
        </div>
      </div>

      <section className="block" id="packages">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">The Babydoll Edit</p>
            <h2>Signature packages</h2>
            <p className="muted">
              Any lash full set, paired with brows and skin. Pick the level of
              reset you need.
            </p>
          </div>
          <div className="packages">
            {PACKAGES.map((pkg) => {
              const featured = "featured" in pkg ? pkg.featured : undefined;
              return (
                <article
                  className={featured ? "pkg feature" : "pkg"}
                  key={pkg.name}
                >
                  {featured && <span className="flag">{featured}</span>}
                  <h3>{pkg.name}</h3>
                  <div className="amt">
                    <sup>$</sup>
                    {pkg.price}
                  </div>
                  <ul className="incl">
                    {pkg.includes.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                  <p>{pkg.description}</p>
                  <a
                    aria-label={`Book ${pkg.name}`}
                    className={featured ? "btn" : "btn btn-ghost"}
                    href={booking.href}
                    rel={booking.rel}
                    target={booking.target}
                  >
                    Book
                  </a>
                </article>
              );
            })}
          </div>
          <p className="center mt-2">
            <Link className="btn btn-ghost" href="/services">
              Full service menu
            </Link>
          </p>
        </div>
      </section>

      <ReviewsSection />
      <VisitSection />
    </>
  );
}
