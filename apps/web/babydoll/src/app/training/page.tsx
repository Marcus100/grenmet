import type { Metadata } from "next";
import Link from "next/link";
import { NewTabNote } from "@/components/new-tab-note";
import { PageHead } from "@/components/sections";
import {
  COURSES,
  EMAIL,
  INSTAGRAM_DM_URL,
  PHONE,
  WHATSAPP_URL,
} from "@/data/site";

/** The studio's contact details, the same ones the Contact page lists. */
const CHANNELS = [
  {
    title: "Message on WhatsApp",
    detail: PHONE.display,
    href: WHATSAPP_URL,
    newTab: true,
  },
  { title: "Call", detail: PHONE.display, href: PHONE.href, newTab: false },
  {
    title: "Message on Instagram",
    detail: "@babydoll.gnd",
    href: INSTAGRAM_DM_URL,
    newTab: true,
  },
  { title: "Email us", detail: EMAIL.address, href: EMAIL.href, newTab: false },
];

export const metadata: Metadata = {
  title: "Training",
  description:
    "Lash and brow training in Grenada from Babydoll Beauty Bar. Register your interest for the next dates.",
  alternates: { canonical: "/training" },
};

export default function TrainingPage() {
  return (
    <>
      <PageHead
        accent="Babydoll way"
        eyebrow="Training"
        lede="Small-group and one-to-one training for new and working lash and brow artists. Register your interest and we'll contact you when dates open."
        title="Learn the"
      />
      <section className="flush-top block">
        <div className="wrap courses">
          {COURSES.map((course) => (
            <article className="course" key={course.name}>
              <span className="tbc">Dates to be announced</span>
              <h2>{course.name}</h2>
              <p className="muted">{course.audience}</p>
              <ul>
                {course.topics.map((topic) => (
                  <li key={topic}>{topic}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>
      <section className="band block">
        <div className="wrap split">
          <div className="section-head tight">
            <p className="eyebrow">Register interest</p>
            <h2>Save your seat</h2>
            <p className="muted">
              Message us the course you want and your experience, whichever way
              suits you. Class sizes are kept small.
            </p>
          </div>
          <div className="channels">
            {CHANNELS.map((channel) => (
              <a
                className="channel"
                href={channel.href}
                key={channel.title}
                {...(channel.newTab
                  ? { rel: "noopener", target: "_blank" }
                  : {})}
              >
                <b>{channel.title}</b> <span>{channel.detail}</span>
                {channel.newTab && <NewTabNote />}
                <i aria-hidden="true">→</i>
              </a>
            ))}
            <Link className="channel" href="/contact">
              <b>Other ways to reach us</b>
              <span>TikTok, Facebook and studio details</span>
              <i aria-hidden="true">→</i>
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
