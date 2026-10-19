import type { Metadata } from "next";
import { Address, Hours } from "@/components/hours";
import { PageHead } from "@/components/sections";
import { BOOKING_URL, INSTAGRAM_DM_URL, MAPS_URL, SOCIALS } from "@/data/site";

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Find Babydoll Beauty Bar at Rose Garden Apartments, Lower Mont Tout, St. George's, Grenada. By appointment only.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const channels = [
    {
      title: "Book online",
      detail: "Choose a service and a time that suits you",
      href: BOOKING_URL,
    },
    {
      title: "Message on Instagram",
      detail: "@babydoll.gnd · the quickest way to reach us",
      href: INSTAGRAM_DM_URL,
    },
    ...SOCIALS.slice(1).map((social) => ({
      title: social.name,
      detail: social.handle,
      href: social.href,
    })),
  ];
  return (
    <>
      <PageHead
        accent="hello"
        eyebrow="Contact us"
        lede="Questions before you book? Send us a message. To book, use the online calendar."
        title="Say"
      />
      <section className="flush-top block">
        <div className="wrap split">
          <div className="channels">
            {channels.map((channel) => (
              <a
                className="channel"
                href={channel.href}
                key={channel.title}
                rel="noopener"
                target="_blank"
              >
                <b>{channel.title}</b>
                <span>{channel.detail}</span>
                <i aria-hidden="true">→</i>
              </a>
            ))}
          </div>
          <div className="contact-cards">
            <div>
              <h2>Studio</h2>
              <Address />
              <p className="mt-2">
                <a
                  className="btn btn-ghost"
                  href={MAPS_URL}
                  rel="noopener"
                  target="_blank"
                >
                  Open in Maps
                </a>
              </p>
            </div>
            <div>
              <h2>Hours</h2>
              <Hours />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
