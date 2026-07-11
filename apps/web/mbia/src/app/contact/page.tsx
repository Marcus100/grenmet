import { Mail, MapPin, Phone, Printer } from "lucide-react";
import type { Metadata } from "next";
import { ContactForm } from "@/components/contact-form";
import { SectionHero } from "@/components/section-hero";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with the Grenada Airports Authority — phone, email, and office locations at MBIA and Lauriston Airport.",
};

const CONTACT_ITEMS = [
  {
    icon: MapPin,
    label: "Head office",
    lines: [
      "Grenada Airports Authority",
      "Maurice Bishop International Airport",
      "Point Salines, St. George's, Grenada",
    ],
  },
  {
    icon: Phone,
    label: "Phone",
    lines: ["+1 (473) 444-4555", "+1 (473) 444-4155", "+1 (473) 444-4101"],
  },
  {
    icon: Printer,
    label: "Fax",
    lines: ["+1 (473) 444-4838"],
  },
  {
    icon: Mail,
    label: "Email",
    lines: ["gaa@gaa.gd"],
  },
] as const;

export default function ContactPage() {
  return (
    <>
      <SectionHero
        dek="Questions about flights, services or doing business with our airports? We're here to help."
        eyebrow="Grenada Airports Authority"
        title="Contact us"
      />
      <div className="mx-auto grid max-w-7xl gap-12 px-4 py-14 lg:grid-cols-[340px_1fr] lg:px-8">
        <div className="space-y-6">
          {CONTACT_ITEMS.map((item) => (
            <div className="flex gap-4" key={item.label}>
              <span className="h-fit rounded-xl bg-gaa-mist p-3 text-gaa-navy">
                <item.icon aria-hidden="true" className="size-5" />
              </span>
              <div>
                <p className="font-display font-semibold text-gaa-navy">
                  {item.label}
                </p>
                {item.lines.map((line) => (
                  <p
                    className="text-gaa-muted text-sm leading-relaxed"
                    key={line}
                  >
                    {line}
                  </p>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="rounded-3xl border border-gaa-rule bg-white p-6 sm:p-10">
          <h2 className="font-bold font-display text-2xl text-gaa-navy">
            Send us a message
          </h2>
          <p className="mt-2 mb-8 text-gaa-muted text-sm">
            We aim to respond within two working days.
          </p>
          <ContactForm />
        </div>
      </div>
    </>
  );
}
