import type { Metadata } from "next";
import Link from "next/link";
import { ChannelLinks } from "@/components/channel-links";
import { PageHead } from "@/components/sections";
import { COURSES } from "@/data/site";

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
          <div className="quick-block">
            <ChannelLinks />
            <p className="quick-more">
              <Link href="/contact">
                TikTok, Facebook and studio details on Contact us
              </Link>
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
