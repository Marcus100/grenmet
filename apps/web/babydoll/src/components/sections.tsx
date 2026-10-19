import { Address, Hours } from "@/components/hours";
import {
  BOOKING_URL,
  GOOGLE_PROFILE_URL,
  GOOGLE_REVIEW_URL,
  RATING,
  REVIEWS,
  SOCIALS,
} from "@/data/site";

export function PageHead({
  eyebrow,
  title,
  accent,
  lede,
}: {
  eyebrow: string;
  title: string;
  accent?: string;
  lede?: string;
}) {
  return (
    <header className="page-head">
      <div className="wrap">
        <p className="eyebrow">{eyebrow}</p>
        <h1>
          {title}
          {accent && (
            <>
              {" "}
              <em>{accent}</em>
            </>
          )}
        </h1>
        {lede && <p className="lede">{lede}</p>}
      </div>
    </header>
  );
}

export function ReviewsSection() {
  return (
    <section className="band block" id="reviews">
      <div className="wrap">
        <div className="reviews-head">
          <div className="section-head tight">
            <p className="eyebrow">From the chair</p>
            <h2>What dolls say</h2>
            <p className="muted">
              <span aria-hidden="true">★★★★★</span> {RATING.score} average from{" "}
              {RATING.count} client reviews
            </p>
          </div>
          <a
            className="btn btn-ghost"
            href={GOOGLE_PROFILE_URL}
            rel="noopener"
            target="_blank"
          >
            Read our Google reviews
          </a>
        </div>
        <div className="reviews">
          {REVIEWS.map((review) => (
            <figure key={review.name}>
              <blockquote>{review.quote}</blockquote>
              <figcaption>
                <b>{review.name}</b> · {review.service}
              </figcaption>
            </figure>
          ))}
        </div>
        <div className="google">
          <div className="score">
            {RATING.score}
            <small>★★★★★ · {RATING.count} reviews</small>
          </div>
          <div>
            <h3>
              Loved your visit? <em>Tell Google.</em>
            </h3>
            <p>
              A short Google review helps new clients in Grenada find us. It
              takes about a minute.
            </p>
          </div>
          <div className="acts">
            <a
              className="btn btn-solid"
              href={GOOGLE_REVIEW_URL}
              rel="noopener"
              target="_blank"
            >
              Leave a Google review
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function VisitSection() {
  return (
    <section className="visit block">
      <div className="wrap visit-grid">
        <div>
          <p className="eyebrow">Find us</p>
          <h2>Visit the studio</h2>
          <Address />
          <a className="btn" href={BOOKING_URL} rel="noopener" target="_blank">
            Make an appointment
          </a>
        </div>
        <div>
          <p className="eyebrow">Hours</p>
          <Hours />
          <p className="hours-note">
            Book online before you come. Walk-ins can't be seen.
          </p>
        </div>
        <div>
          <p className="eyebrow">Follow along</p>
          <ul className="social">
            {SOCIALS.map((social) => (
              <li key={social.name}>
                <a href={social.href} rel="noopener" target="_blank">
                  <span>
                    {social.name} · {social.handle}
                  </span>
                  <span aria-hidden="true">→</span>
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
