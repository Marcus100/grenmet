import { CalendarDays, House, Settings, Users } from "lucide-react";
import type { AdminNavGroup } from "../lib/navigation";

export const NAVIGATION: readonly AdminNavGroup[] = [
  {
    id: "main",
    items: [
      { id: "home", title: "Home", url: "/", icon: <House />, tab: true },
      {
        badge: 3,
        badgeLabel: "3 waiting to be confirmed",
        icon: <CalendarDays />,
        id: "agenda",
        tab: true,
        title: "Agenda",
        url: "/agenda",
      },
      {
        id: "people",
        title: "People",
        url: "/people",
        icon: <Users />,
        tab: true,
      },
    ],
  },
  {
    id: "manage",
    label: "Manage",
    items: [
      {
        badge: "new",
        id: "reports",
        title: "Reports",
        url: "/reports",
      },
      {
        icon: <Settings />,
        id: "settings",
        title: "Settings",
        subItems: [
          { id: "settings-general", title: "General", url: "/settings" },
          {
            id: "settings-billing",
            title: "Billing",
            url: "/settings/billing",
          },
        ],
      },
    ],
  },
];

export const USER = {
  email: "ada@example.com",
  name: "Ada Lovelace",
} as const;
