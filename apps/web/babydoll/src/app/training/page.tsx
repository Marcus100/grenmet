import type { Metadata } from "next";
import Link from "next/link";
import { PageHead } from "@/components/sections";
import { COURSES, INSTAGRAM_DM_URL } from "@/data/site";

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
              Send us a message with the course you want and your experience.
              Class sizes are kept small.
            </p>
          </div>
          <div className="channels">
            <a
              className="channel"
              href={INSTAGRAM_DM_URL}
              rel="noopener"
              target="_blank"
            >
              <b>Message on Instagram</b>
              <span>
                @babydoll.gnd · tell us the course and your experience
              </span>
              <i aria-hidden="true">→</i>
            </a>
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
