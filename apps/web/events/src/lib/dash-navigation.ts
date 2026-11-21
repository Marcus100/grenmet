import type { Route } from "next";
import type { ManagedEvent } from "@/domain/types";

const WHITESPACE = /\s+/u;

/** The organiser console screens, used to mark the current item in the nav. */
export type DashSection =
  | "overview"
  | "events"
  | "build"
  | "tickets"
  | "orders"
  | "attendees"
  | "door"
  | "finance"
  | "team"
  | "settings";

/**
 * The event the console is working on: the one in the URL, or the one the
 * member last opened when a screen is not about a single event.
 */
export interface ShellEvent {
  readonly id: string;
  /** Only ticketed events have orders, attendees, door and settlement screens. */
  readonly ticketed: boolean;
  readonly title: string;
}

export function shellEventOf(
  listing: Pick<ManagedEvent, "admission" | "id" | "title">
): ShellEvent {
  return {
    id: listing.id,
    ticketed: listing.admission === "ticketed",
    title: listing.title,
  };
}

/**
 * One nav entry. Plain data only (no icon components), so the same array can
 * be passed from a Server Component to the mobile menu's Client Component.
 */
export interface DashNavItem {
  /** Short visible text under the label: why a link goes somewhere else. */
  readonly hint?: string;
  /** Null while the screen is still to come. */
  readonly href: Route | null;
  readonly key: DashSection;
  readonly label: string;
}

export const PICK_EVENT_HINT = "Pick an event";
export const TICKETED_ONLY_HINT = "Ticketed events only";
export const COMING_SOON_HINT = "Coming soon";

/**
 * The organiser nav. Event-scoped items link into the selected event; with no
 * event they send the member to /dash/events to choose one. A non-ticketed
 * event has no orders, attendees, door or settlement screens, so those items
 * go to its editor instead.
 */
type ScopedKey = "tickets" | "orders" | "attendees" | "door" | "finance";

export function dashNavigation(event: ShellEvent | null): DashNavItem[] {
  const pick: Route = "/dash/events";
  const editor = (id: string) =>
    `/dash/events/${encodeURIComponent(id)}` as Route;

  /** A link into the selected event, or the event list when none is selected. */
  function scoped(
    key: ScopedKey,
    label: string,
    ticketedPath: (id: string) => string,
    ticketedOnly: boolean
  ): DashNavItem {
    if (!event) {
      return { key, label, href: pick, hint: PICK_EVENT_HINT };
    }
    if (ticketedOnly && !event.ticketed) {
      return { key, label, href: editor(event.id), hint: TICKETED_ONLY_HINT };
    }
    return { key, label, href: ticketedPath(event.id) as Route };
  }

  const path = (suffix: string) => (id: string) => `${editor(id)}${suffix}`;

  return [
    { key: "overview", label: "Overview", href: "/dash" },
    { key: "events", label: "My events", href: pick },
    { key: "build", label: "Build event", href: "/dash/events/new" },
    scoped("tickets", "Tickets & capacity", path("#admission"), false),
    scoped("orders", "Orders", path("/orders"), true),
    scoped("attendees", "Attendees", path("/attendees"), true),
    scoped("door", "Door & box office", path("/door"), true),
    scoped("finance", "Finance", path("/settlement"), true),
    { key: "team", label: "Team and roles", href: "/dash/team" },
    { key: "settings", label: "Settings", href: null, hint: COMING_SOON_HINT },
  ];
}

/** Up to two initials for the account block; "?" when there is no name. */
export function initialsOf(name: string): string {
  const words = name
    .trim()
    .split(WHITESPACE)
    .filter((word) => word !== "");
  const first = words[0];
  const last = words.at(-1);
  if (!first) {
    return "?";
  }
  if (words.length === 1 || !last) {
    return first.slice(0, 2).toUpperCase();
  }
  return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();
}
