// Everything the client may change lives here: booking link, address, hours,
// services and prices, packages, reviews and social links. Prices mirror the
// client's Acuity booking page (babydollgnd.as.me); keep them in step.

export const SITE_URL = "https://babydoll.barrels.gd";
export const BOOKING_URL = "https://babydollgnd.as.me";
export const INSTAGRAM_DM_URL = "https://ig.me/m/babydoll.gnd";
/** The manual channel the booking flow points people to (Instagram DM). */
export const BOOKING_CONTACT = { href: INSTAGRAM_DM_URL, label: "Instagram" };
// The client's Google Business Profile: review form and public profile.
export const GOOGLE_REVIEW_URL = "https://g.page/r/CXicqwbsBju0EAE/review";
export const GOOGLE_PROFILE_URL = "https://share.google/lqfZTCWbyABRADcTp";
export const MAPS_URL =
  "https://www.google.com/maps/search/?api=1&query=Rose+Garden+Apartments+Lower+Mont+Tout+St+George%27s+Grenada";

export const BUSINESS = {
  name: "Babydoll Beauty Bar",
  legalName: "Baby Doll Beauty Bar",
  tagline: "Elevating lashes, brows & skin in Grenada",
  founder: "Jeriann Marryshow-Fleming",
  address: [
    "Rose Garden Apartments",
    "Lower Mont Tout",
    "St. George's, Grenada",
  ],
  appointmentOnly: "By appointment only",
} as const;

export const RATING = { score: "5.0", count: 41 } as const;

export const HOURS = [
  { days: "Monday – Friday", time: "9:30 am – 5:30 pm" },
  { days: "Saturday", time: "9:00 am – 5:30 pm" },
  { days: "Sunday", time: "Closed", closed: true },
] as const;

export const SOCIALS = [
  {
    name: "Instagram",
    handle: "@babydoll.gnd",
    href: "https://instagram.com/babydoll.gnd",
  },
  {
    name: "TikTok",
    handle: "@babydoll.gnd",
    href: "https://www.tiktok.com/@babydoll.gnd",
  },
  {
    name: "Facebook",
    handle: "Babydoll Beauty Bar",
    href: "https://www.facebook.com/profile.php?id=61557287381638",
  },
] as const;

export const NAV = [
  { href: "/", label: "Home" },
  { href: "/services", label: "Services" },
  { href: "/portfolio", label: "Portfolio" },
  { href: "/about", label: "About us" },
  { href: "/training", label: "Training" },
  { href: "/contact", label: "Contact us" },
] as const;

export const CONSULTATION_PRICE = 50;

export interface Service {
  /** Add-ons are booked with another service, so they get no Book link. */
  addOn?: boolean;
  description?: string;
  name: string;
  note?: string;
  price: number;
}
export interface ServiceGroup {
  services: Service[];
  title: string;
}
export interface ServiceCategory {
  groups: [ServiceGroup, ServiceGroup];
  id: "lashes" | "brows" | "skin";
  label: string;
}

export const SERVICE_MENU: ServiceCategory[] = [
  {
    id: "lashes",
    label: "Lashes",
    groups: [
      {
        title: "Lash full sets",
        services: [
          {
            name: "Luxe Classic",
            price: 210,
            description:
              "One extension per natural lash. Length and definition with a light, everyday feel.",
            note: "Consultation required",
          },
          {
            name: "Hybrid",
            price: 225,
            description:
              "Classic and volume lashes combined for a fuller, textured look that still feels light.",
          },
          {
            name: "Volume",
            price: 245,
            description:
              "Several lightweight extensions per natural lash for bold, full-bodied glamour.",
          },
        ],
      },
      {
        title: "Lash maintenance",
        services: [
          {
            name: "Lash touch-up",
            price: 65,
            description: "At one week, to keep fullness at its best.",
          },
          {
            name: "Refill, 2–3 weeks",
            price: 130,
            description: "Fills the gaps and keeps your set full.",
            note: "Book while 40%+ of extensions remain",
          },
          {
            name: "Professional removal",
            price: 45,
            description: "Safe removal that protects your natural lashes.",
          },
        ],
      },
    ],
  },
  {
    id: "brows",
    label: "Brows",
    groups: [
      {
        title: "Brow shape & tint",
        services: [
          {
            name: "Signature brow sculpt & wax",
            price: 40,
            description:
              "A custom shape mapped to your features, finished clean.",
          },
          {
            name: "Hybrid brow tint / stain",
            price: 60,
            description: "Tint only, for depth and definition.",
          },
          {
            name: "Hybrid brow tint & wax",
            price: 100,
            description: "Shaped and tinted for a natural, long-lasting look.",
          },
        ],
      },
      {
        title: "Brow lamination",
        services: [
          {
            name: "Brow lamination",
            price: 180,
            description:
              "Smooths and sets your natural hairs for a fluffy, defined brow that lasts up to 6 weeks.",
          },
          {
            name: "Lamination maintenance",
            price: 100,
            description:
              "At 2–3 weeks: a tint refresh and treatment to lift, shape and define.",
          },
          {
            name: "Deluxe brow add-on",
            price: 50,
            description: "Add to any brow service.",
            addOn: true,
          },
          {
            name: "Brow treatment add-on",
            price: 20,
            description: "Add to any brow service.",
            addOn: true,
          },
        ],
      },
    ],
  },
  {
    id: "skin",
    label: "Facials & waxing",
    groups: [
      {
        title: "Facials",
        services: [
          {
            name: "Custom facial",
            price: 180,
            description:
              "Tailored to your skin: cleanse, exfoliation, extractions where needed, a customised mask, facial massage and targeted finishing products.",
          },
        ],
      },
      {
        title: "Facial waxing",
        services: [
          { name: "Upper lip", price: 15 },
          { name: "Chin", price: 25 },
        ],
      },
    ],
  },
];

export const PACKAGES = [
  {
    name: "Babydoll Essential",
    price: 300,
    includes: ["Any lash full set", "Hybrid brow tint & wax"],
    description:
      "Your signature lash and brow pairing for a polished, put-together look.",
  },
  {
    name: "The Pretty Doll",
    price: 450,
    includes: ["Any lash full set", "Hybrid brow tint & wax", "Express facial"],
    description: "Leave polished from lashes to skin.",
    featured: "Most complete reset",
  },
  {
    name: "The Luxe Doll",
    price: 550,
    includes: ["Any lash full set", "Brow lamination", "Custom facial"],
    description:
      "The full Babydoll experience, with elevated lash, brow and skincare services.",
  },
] as const;

// Public reviews (originally on Fresha). The client confirms permission to
// quote them by first name and initial.
export const REVIEWS = [
  {
    quote: "Best service, very comfortable, and Babydoll you are awesome!",
    name: "Mikki R.",
    service: "Textured lash extensions",
  },
  {
    quote:
      "She took the time to carefully explain each step and answered any questions I had.",
    name: "Chirelle R.",
    service: "Classic lash extensions",
  },
  {
    quote: "Very professional. Lovely intimate and calming environment.",
    name: "Kassie C.",
    service: "Classic lash extensions",
  },
] as const;

export type PortfolioCategory = "lashes" | "brows" | "skin";
// Photo slots. Add `image: "/portfolio/<file>.jpg"` and `alt` once the client
// sends consented photos; tiles without an image show a placeholder.
export const PORTFOLIO: {
  label: string;
  category: PortfolioCategory;
  size?: "tall" | "wide";
  image?: string;
  alt?: string;
}[] = [
  { label: "Volume full set", category: "lashes", size: "tall" },
  { label: "Brow lamination", category: "brows" },
  { label: "Classic full set", category: "lashes" },
  { label: "Hybrid full set", category: "lashes", size: "wide" },
  { label: "Custom facial glow", category: "skin", size: "tall" },
  { label: "Sculpt & tint", category: "brows" },
  { label: "Refill, before & after", category: "lashes" },
  { label: "Hybrid tint & wax", category: "brows", size: "wide" },
  { label: "Textured hybrid", category: "lashes" },
];

// DRAFT: course names and outlines await the client's confirmation.
export const COURSES = [
  {
    name: "Classic lash",
    audience: "For beginners. The foundation of every set.",
    topics: [
      "Lash anatomy and safety",
      "Isolation and placement",
      "Live model practice",
    ],
  },
  {
    name: "Hybrid & volume",
    audience: "For artists who already work in classic.",
    topics: ["Fan making", "Mapping and styling", "Retention and aftercare"],
  },
  {
    name: "Brow lamination & tint",
    audience: "Shape, set and tint for a fuller brow.",
    topics: ["Brow mapping", "Lamination steps and timing", "Tint selection"],
  },
] as const;

export const formatPrice = (amount: number) => `$${amount}`;
