import type { ReactNode } from "react";
import { NewTabNote } from "@/components/new-tab-note";
import { CONTACT_CHANNELS } from "@/data/site";

/** Plain line icons, drawn here so the site needs no icon package. */
const ICONS: Record<(typeof CONTACT_CHANNELS)[number]["id"], ReactNode> = {
  whatsapp: (
    <path d="M21 11.5a8.5 8.5 0 0 1-12.6 7.4L3 20.5l1.7-5.2A8.5 8.5 0 1 1 21 11.5Z" />
  ),
  call: (
    <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" />
  ),
  instagram: (
    <>
      <rect height="17" rx="5" width="17" x="3.5" y="3.5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.6" />
    </>
  ),
  email: (
    <>
      <rect height="14" rx="2" width="18" x="3" y="5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
};

/** The email address is too long for a compact link, so it shows no second line. */
const SHOWS_DETAIL: Record<(typeof CONTACT_CHANNELS)[number]["id"], boolean> = {
  whatsapp: true,
  call: true,
  instagram: true,
  email: false,
};

/**
 * The studio's four channels as a compact grid of links: two by two on phones,
 * one row from tablet width. Each is one link, at least 44 px tall.
 */
export function ChannelLinks() {
  return (
    <ul className="quick-channels">
      {CONTACT_CHANNELS.map((channel) => (
        <li key={channel.id}>
          <a
            className="quick-channel"
            href={channel.href}
            {...(channel.newTab ? { rel: "noopener", target: "_blank" } : {})}
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="20"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.5"
              viewBox="0 0 24 24"
              width="20"
            >
              {ICONS[channel.id]}
            </svg>
            <b>{channel.label}</b>{" "}
            {SHOWS_DETAIL[channel.id] && <span>{channel.detail}</span>}
            {channel.newTab && <NewTabNote />}
          </a>
        </li>
      ))}
    </ul>
  );
}
