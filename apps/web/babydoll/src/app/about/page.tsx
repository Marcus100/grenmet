import type { Metadata } from "next";
import { PageHead } from "@/components/sections";
import { BUSINESS } from "@/data/site";

export const metadata: Metadata = {
  title: "About us",
  description:
    "Babydoll Beauty Bar is a one-on-one lash, brow and skin studio in St. George's, Grenada.",
  alternates: { canonical: "/about" },
};

const VALUES = [
  {
    title: "One client at a time",
    text: "No double-booking. Your appointment is yours alone, in a calm, private room.",
  },
  {
    title: "Consult first",
    text: "Every new client starts with a consultation, so the look suits your eyes, brows and skin.",
  },
  {
    title: "Natural first",
    text: "We enhance what you have and protect your natural lashes and brows while we do it.",
  },
];

export default function AboutPage() {
  return (
    <>
      <PageHead
        accent="you feel good."
        eyebrow="About us"
        title="Because when you look good,"
      />
      <section className="flush-top block">
        <div className="wrap split">
          <div className="prose">
            <p>
              Babydoll Beauty Bar is a small studio in St. George's built for
              pampering and self-care. Every service starts from your natural
              features and works to enhance them, never to hide them.
            </p>
            <p>
              It is a quiet, one-on-one space. You get time to ask questions, a
              clear explanation of each step, and results planned around how you
              actually live.
            </p>
            <p>
              We keep up with what is new in lash, brow and skin technique so
              you don't have to.
            </p>
            <p className="sig">
              {BUSINESS.founder}, certified esthetician and founder
            </p>
          </div>
          {/* PHOTO SLOT: portrait of the founder. */}
          <div className="shot portrait">
            <div className="ph">
              <svg aria-hidden="true" viewBox="0 0 24 24">
                <circle cx="12" cy="9" r="4" />
                <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
              </svg>
              <small>Portrait coming soon</small>
            </div>
          </div>
        </div>
      </section>
      <section className="band block">
        <div className="wrap">
          <div className="section-head">
            <p className="eyebrow">How we work</p>
            <h2>The Babydoll standard</h2>
          </div>
          <div className="values">
            {VALUES.map((value) => (
              <div key={value.title}>
                <h3>{value.title}</h3>
                <p>{value.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
