import type { Metadata } from "next";
import { Address, Appointments } from "@/components/appointments";
import { NewTabNote } from "@/components/new-tab-note";
import { PageHead } from "@/components/sections";
import {
  EMAIL,
  INSTAGRAM_DM_URL,
  MAPS_URL,
  PHONE,
  SOCIALS,
  WHATSAPP_URL,
} from "@/data/site";
import { type CtaLink, siteBookingLink } from "@/lib/book-link";

/** One contact card. Web links open a new tab; phone and email do not. */
interface Channel {
  detail: string;
  href: string;
  newTab: boolean;
  title: string;
}

/** Links to WhatsApp, Instagram and the socials always open in a new tab. */
const external = (title: string, detail: string, href: string): Channel => ({
  title,
  detail,
  href,
  newTab: true,
});

export const metadata: Metadata = {
  title: "Contact us",
  description:
    "Find Babydoll Beauty Bar at Rose Garden Apartments, Lower Mont Tout, St. George's, Grenada. By appointment only.",
  alternates: { canonical: "/contact" },
};

export default function ContactPage() {
  // Book online uses the shared booking link, so every Book call-to-action agrees.
  const booking: CtaLink = siteBookingLink();
  const channels: Channel[] = [
    {
      title: "Book online",
      detail: "Choose a service and a time that suits you",
      href: booking.href,
      newTab: true,
    },
    external("Message on WhatsApp", PHONE.display, WHATSAPP_URL),
    { title: "Call", detail: PHONE.display, href: PHONE.href, newTab: false },
    // Neutral wording: Instagram is one of several ways to reach the studio.
    external("Message on Instagram", "@babydoll.gnd", INSTAGRAM_DM_URL),
    {
      title: "Email us",
      detail: EMAIL.address,
      href: EMAIL.href,
      newTab: false,
    },
    ...SOCIALS.slice(1).map((social) =>
      external(social.name, social.handle, social.href)
    ),
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
                {...(channel.newTab
                  ? { rel: "noopener", target: "_blank" }
                  : {})}
              >
                <b>{channel.title}</b> <span>{channel.detail}</span>
                {channel.newTab && <NewTabNote />}
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
              <h2>Appointments</h2>
              <Appointments />
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
