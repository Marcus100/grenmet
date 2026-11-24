// Small line icons for the studio navigation (24 px grid, 1.75 stroke). The
// app has no icon package of its own, so they are drawn here. Decorative: the
// label next to each one carries the meaning.

type IconName =
  | "agenda"
  | "external"
  | "more"
  | "plan"
  | "plus"
  | "people"
  | "services"
  | "settings"
  | "sign-out";

const PATHS: Record<IconName, string> = {
  agenda:
    "M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z",
  external:
    "M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plan: "M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7ZM3 10h18M7 15h3",
  plus: "M12 5v14M5 12h14",
  people:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 6.5M18 14a6.5 6.5 0 0 1 3.5 6",
  services:
    "M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM8.5 7.5 20 17M8.5 16.5 20 7",
  settings: "M4 7h10M18 7h2M4 17h2M10 17h10M16 4v6M8 14v6",
  "sign-out": "M9 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h3M15 8l4 4-4 4M19 12H9",
};

export function StudioIcon({
  className,
  name,
}: Readonly<{ className?: string; name: IconName }>) {
  return (
    <svg
      aria-hidden="true"
      className={className ?? "size-5 shrink-0"}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.75"
      viewBox="0 0 24 24"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export type { IconName };
