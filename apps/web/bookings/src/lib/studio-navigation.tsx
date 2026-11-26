import {
  type AdminNavGroup,
  filterNavigation,
} from "@barrelsgd/admin-kit/lib/navigation";
import {
  CalendarDays,
  CalendarPlus,
  CreditCard,
  ExternalLink,
  Scissors,
  Settings,
  Users,
} from "lucide-react";

/** Marks an item only owners and admins see; the page and the API check it too. */
export const MANAGE = "manage";

export interface StudioNavigationInput {
  /** Owners and admins: New booking and Plan & billing. */
  canManage: boolean;
  orgSlug: string;
  /** Bookings waiting for the business to confirm; null when unread. */
  pendingCount: number | null;
  /** The customers' booking page (`/<public slug>`), when the business has one. */
  publicHref: string | null;
}

/**
 * The studio's one navigation config: the sidebar, the search palette and the
 * phone tab bar all read it. Agenda, Services and People are the tab bar's
 * three destinations (the kit adds "More" for the rest). Already filtered by
 * role, so nothing is offered that the person cannot use.
 */
export function studioNavigation({
  canManage,
  orgSlug,
  pendingCount,
  publicHref,
}: StudioNavigationInput): AdminNavGroup[] {
  const base = `/studio/${orgSlug}`;
  const groups: AdminNavGroup[] = [
    {
      id: "bookings",
      label: "Bookings",
      items: [
        {
          id: "agenda",
          title: "Agenda",
          url: `${base}/agenda`,
          icon: <CalendarDays />,
          // A booking's detail page belongs to Agenda; New booking's own URL
          // outranks this prefix, so it stays current on /bookings/new.
          activePrefixes: [`${base}/bookings/`],
          tab: true,
          ...(pendingCount
            ? {
                badge: pendingCount,
                badgeLabel: `${pendingCount} waiting to be confirmed`,
              }
            : {}),
        },
        {
          id: "new-booking",
          title: "New booking",
          url: `${base}/bookings/new`,
          icon: <CalendarPlus />,
          requires: MANAGE,
        },
      ],
    },
    {
      id: "business",
      label: "Business",
      items: [
        {
          id: "services",
          title: "Services",
          url: `${base}/services`,
          icon: <Scissors />,
          tab: true,
        },
        {
          id: "people",
          title: "People",
          url: `${base}/people`,
          icon: <Users />,
          tab: true,
        },
        {
          id: "settings",
          title: "Settings",
          url: `${base}/settings`,
          icon: <Settings />,
        },
        {
          id: "plan",
          title: "Plan & billing",
          url: `${base}/plan`,
          icon: <CreditCard />,
          requires: MANAGE,
        },
      ],
    },
  ];
  if (publicHref) {
    groups.push({
      id: "page",
      label: "Your page",
      items: [
        {
          id: "view-page",
          title: "View my page",
          url: publicHref,
          icon: <ExternalLink />,
          newTab: true,
        },
      ],
    });
  }
  return filterNavigation(groups, (item) =>
    item.requires === MANAGE ? canManage : true
  );
}
