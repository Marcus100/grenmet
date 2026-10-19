import type { Metadata } from "next";
import Link from "next/link";
import { BOOKING_URL } from "@/data/site";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

export default function NotFound() {
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
          <a
            className="btn btn-solid"
            href={BOOKING_URL}
            rel="noopener"
            target="_blank"
          >
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
