import type { Metadata } from "next";
import Link from "next/link";
import { siteBookingLink } from "@/lib/book-link";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
  const booking = siteBookingLink();
  return (
    <header className="page-head">
      <div className="wrap">
        <p className="eyebrow">404</p>
        <h1>
          This page <em>isn't here</em>
        </h1>
        <p className="lede">
          The link may be old. Try the home page or book straight away.
        </p>
        <div className="ctas">
          <a className="btn btn-solid" {...booking}>
            Book now
          </a>
          <Link className="btn btn-ghost" href="/">
            Home
          </Link>
        </div>
      </div>
    </header>
  );
}
