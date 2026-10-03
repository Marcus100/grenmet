import { cn } from "@barrelsgd/ui/lib/utils";

export type AppId = "admin" | "mbia" | "weather" | "docs" | "signal" | "events";

interface AppEntry {
  // Names an app may send as `?app=` or as its return host's first label.
  readonly aliases: readonly string[];
  readonly description: string;
  readonly id: AppId;
  readonly monogram: string;
  readonly name: string;
}

interface AppGroup {
  readonly apps: readonly AppEntry[];
  readonly label: string;
}

// GAA is the client organisation and GMS its meteorological department;
// Barrels owns only its own products.
export const APP_GROUPS: readonly AppGroup[] = [
  {
    label: "GAA",
    apps: [
      {
        id: "admin",
        name: "GAA Admin",
        description: "CAP, HR, WxWatch, WxProducts, SalesBus, eRegister",
        monogram: "GA",
        aliases: ["admin", "gaa-admin", "admin-gms"],
      },
      {
        id: "mbia",
        name: "Airport website",
        description: "Maurice Bishop International and Lauriston",
        monogram: "MB",
        aliases: ["mbia"],
      },
    ],
  },
  {
    label: "GMS",
    apps: [
      {
        id: "weather",
        name: "Weather",
        description: "Forecasts, warnings and news",
        monogram: "Wx",
        aliases: ["gms", "weather", "gms-cms"],
      },
      {
        id: "docs",
        name: "Docs",
        description: "Guides and operating procedures",
        monogram: "Dc",
        aliases: ["docs"],
      },
    ],
  },
  {
    label: "Barrels",
    apps: [
      {
        id: "signal",
        name: "Signal",
        description: "Grenada civic news",
        monogram: "Sg",
        aliases: ["signal"],
      },
      {
        id: "events",
        name: "Events",
        description: "Event listings and tickets",
        monogram: "Ev",
        aliases: ["events"],
      },
    ],
  },
];

export function findRequestedApp(requested: string | null): AppId | null {
  const needle = requested?.trim().toLowerCase();
  if (!needle) return null;
  for (const group of APP_GROUPS) {
    for (const app of group.apps) {
      if (app.aliases.includes(needle)) return app.id;
    }
  }
  return null;
}

interface AppDirectoryProps {
  /** Present on account pages only; sign-in pages list apps without links. */
  readonly hrefs?: Partial<Record<AppId, string>>;
  readonly requestedApp?: string | null;
}

export function AppDirectory({ hrefs, requestedApp }: AppDirectoryProps) {
  const highlighted = findRequestedApp(requestedApp ?? null);

  return (
    <nav aria-label="Apps" className="space-y-6">
      {APP_GROUPS.map((group) => (
        <section className="space-y-2" key={group.label}>
          <h2 className="font-mono text-gm-sky text-label uppercase tracking-widest">
            {group.label}
          </h2>
          <ul className="space-y-1">
            {group.apps.map((app) => {
              const href = hrefs?.[app.id];
              const isCurrent = app.id === highlighted;
              const body = (
                <>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg font-semibold text-body-sm",
                      isCurrent
                        ? "bg-gm-lime text-gm-navy"
                        : "bg-white/10 text-gm-text-inverse"
                    )}
                  >
                    {app.monogram}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-gm-text-inverse text-sm">
                      {app.name}
                    </span>
                    <span className="block truncate text-body-sm text-gm-surface-muted">
                      {app.description}
                    </span>
                  </span>
                </>
              );
              const rowClass = cn(
                "flex items-center gap-3 rounded-xl p-2",
                isCurrent && "bg-white/10 ring-1 ring-white/20"
              );
              return (
                <li aria-current={isCurrent || undefined} key={app.id}>
                  {href ? (
                    <a
                      className={cn(rowClass, "transition hover:bg-white/10")}
                      href={href}
                    >
                      {body}
                    </a>
                  ) : (
                    <div className={rowClass}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

/** Friendly name for `?app=`, e.g. "admin-gms" → "GAA Admin". */
export function getAppDisplayName(requested: string | null): string | null {
  const id = findRequestedApp(requested);
  if (!id) return null;
  for (const group of APP_GROUPS) {
    const app = group.apps.find((entry) => entry.id === id);
    if (app) return app.name;
  }
  return null;
}
