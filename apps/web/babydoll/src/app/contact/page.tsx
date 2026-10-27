import type { Metadata } from "next";
import { Address, Hours } from "@/components/hours";
import { PageHead } from "@/components/sections";
import { INSTAGRAM_DM_URL, MAPS_URL, SOCIALS } from "@/data/site";
import { type CtaLink, siteBookingLink } from "@/lib/book-link";

/** Links to Instagram and the socials always open in a new tab. */
const external = (href: string): CtaLink => ({
  href,
  target: "_blank",
  rel: "noopener",
});

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Find Babydoll Beauty Bar at Rose Garden Apartments, Lower Mont Tout, St. George's, Grenada. By appointment only.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  const channels: { title: string; detail: string; link: CtaLink }[] = [
    {
      title: "Book online",
      detail: "Choose a service and a time that suits you",
      link: siteBookingLink(),
    },
    {
      title: "Message on Instagram",
      detail: "@babydoll.gnd · the quickest way to reach us",
      link: external(INSTAGRAM_DM_URL),
    },
    ...SOCIALS.slice(1).map((social) => ({
      title: social.name,
      detail: social.handle,
      link: external(social.href),
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
              <a className="channel" key={channel.title} {...channel.link}>
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
