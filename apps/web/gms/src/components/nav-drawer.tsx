"use client";

import { AccountButton } from "@barrelsgd/ui/components/account-button";
import { Accordion } from "@base-ui/react/accordion";
import {
  AnchorIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LogInIcon,
  PlaneIcon,
  RadarIcon,
  TornadoIcon,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect } from "react";
import {
  type AlertsSource,
  CHECKING_ALERTS,
  WithAlerts,
} from "@/components/with-alerts";
import { alertsLevel, alertsSummary } from "@/lib/cap-alerts";
import { menuSheet } from "@/lib/motion";
import { NAV_SECTIONS } from "@/lib/nav-sections";
import { cn } from "@/lib/utils";
import { WARNING_LEVEL_SURFACE } from "@/lib/warning-level";

const QUICK_LINKS = [
  { href: "/weather/radar", label: "Radar", Icon: RadarIcon },
  { href: "/weather/tropics", label: "Tropics", Icon: TornadoIcon },
  { href: "/services/aviation", label: "For pilots", Icon: PlaneIcon },
  { href: "/marine/forecast", label: "For mariners", Icon: AnchorIcon },
] as const;

interface NavDrawerProps {
  /** Shows "Sign in" with the Barrels account (ADR-0017) when configured. */
  accountLabel?: string;
  /** Live warning status, shown as a tag on the Alerts section. */
  alerts?: AlertsSource;
  onClose: () => void;
  open: boolean;
  /** Viewport y of the header's bottom edge; the menu opens beneath it. */
  top?: number;
}

function AlertsTag({
  children,
  className,
}: {
  children: React.ReactNode;
  className: string;
}) {
  return (
    <span
      className={cn(
        "text-caption leading-caption truncate rounded-md px-2 py-0.5 font-bold",
        className
      )}
    >
      {children}
    </span>
  );
}

export function NavDrawer({
  accountLabel,
  alerts,
  open,
  onClose,
  top = 0,
}: NavDrawerProps) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    if (open) document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          animate="show"
          aria-label="Site menu"
          className="bg-background fixed inset-x-0 bottom-0 z-30 flex flex-col"
          exit="exit"
          id="site-menu"
          initial="hidden"
          style={{ top }}
          variants={menuSheet}
        >
          <div className="flex h-full flex-col">
            {/* Brand accent line under the navy header */}
            <div className="flex h-1 w-full shrink-0">
              <div className="bg-gm-blue h-full flex-[55]" />
              <div className="bg-gm-sky h-full flex-[25]" />
              <div className="bg-gm-lime h-full flex-[20]" />
            </div>

            <div className="border-gm-border grid shrink-0 grid-cols-4 gap-1 border-b px-2 py-2">
              {QUICK_LINKS.map(({ href, label, Icon }) => (
                <a
                  className="text-caption text-gm-heading leading-caption hover:bg-gm-surface flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg px-1 text-center font-semibold"
                  href={href}
                  key={href}
                  onClick={onClose}
                >
                  <Icon aria-hidden="true" className="text-gm-sky-ink size-5" />
                  {label}
                </a>
              ))}
            </div>

            {/* Nav body */}
            <nav
              aria-label="Site sections"
              className="flex-1 overflow-y-auto pb-9"
            >
              <Accordion.Root>
                {NAV_SECTIONS.map((section, i) => (
                  <div key={section.label}>
                    <Accordion.Item value={section.label}>
                      <Accordion.Header className="flex">
                        <Accordion.Trigger
                          className={cn(
                            "group h-header flex w-full items-center justify-between pr-5 pl-6",
                            i > 0 && "border-gm-border border-t"
                          )}
                        >
                          {/* Base UI's Accordion.Trigger marks the open state
                              with data-panel-open, not data-open. */}
                          <span className="flex min-w-0 items-center gap-3">
                            <span className="text-gm-text-primary text-heading-md leading-heading-md group-data-panel-open:text-gm-heading font-normal group-data-panel-open:font-semibold">
                              {section.label}
                            </span>
                            {/* The live warning status rides on the Alerts
                                section instead of a row of its own. */}
                            {section.href === "/alerts" && alerts && (
                              <WithAlerts
                                alerts={alerts}
                                fallback={
                                  <AlertsTag className="bg-gm-surface-muted text-gm-text-secondary">
                                    {CHECKING_ALERTS}
                                  </AlertsTag>
                                }
                              >
                                {(result) => (
                                  <AlertsTag
                                    className={
                                      WARNING_LEVEL_SURFACE[alertsLevel(result)]
                                    }
                                  >
                                    {alertsSummary(result)}
                                  </AlertsTag>
                                )}
                              </WithAlerts>
                            )}
                          </span>
                          <div className="flex size-11 items-center justify-center">
                            <ChevronDownIcon className="text-gm-text-muted group-data-panel-open:text-gm-heading size-6 transition-transform duration-150 group-data-panel-open:rotate-180 motion-reduce:transition-none" />
                          </div>
                        </Accordion.Trigger>
                      </Accordion.Header>
                      {
                        <Accordion.Panel
                          className="overflow-hidden transition-[height] duration-150 ease-out motion-reduce:transition-none"
                          style={
                            {
                              height: "var(--accordion-panel-height, 0)",
                            } as React.CSSProperties
                          }
                        >
                          {/* Phones get short lists: group headings for
                              context (two "Heat" links mean different things),
                              but no descriptions; the desktop mega menu keeps
                              those. */}
                          <a
                            className="text-body-base text-gm-blue-ink leading-body-base flex min-h-11 items-center gap-1 px-6 font-semibold"
                            href={section.href}
                            onClick={onClose}
                          >
                            All {section.label.toLowerCase()}
                            <ChevronRightIcon
                              aria-hidden="true"
                              className="size-4"
                            />
                          </a>
                          {section.groups.map((group) => (
                            <div className="pb-1" key={group.heading}>
                              <p className="text-caption text-gm-text-muted leading-caption px-6 pt-3 pb-1 font-semibold tracking-wider uppercase">
                                {group.heading}
                              </p>
                              <ul>
                                {group.links.map((link) => (
                                  <li key={link.href}>
                                    <a
                                      className="text-body-base text-gm-text-primary leading-body-base hover:bg-gm-surface flex min-h-11 items-center py-2 pr-5 pl-10"
                                      href={link.href}
                                      onClick={onClose}
                                    >
                                      {link.name}
                                    </a>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}
                        </Accordion.Panel>
                      }
                    </Accordion.Item>
                  </div>
                ))}
              </Accordion.Root>
              <div className="border-gm-border flex flex-col gap-2 border-t px-6 pt-5">
                <p className="text-gm-text-muted text-label leading-label font-bold tracking-wider uppercase">
                  Your account
                </p>
                {accountLabel ? (
                  <AccountButton appLabel={accountLabel} />
                ) : (
                  // Static placeholder until sign-in is configured for this site.
                  <button
                    className="border-gm-border text-body text-gm-text-primary leading-body hover:bg-gm-surface flex h-11 w-fit items-center gap-2 rounded-md border px-4 font-semibold"
                    type="button"
                  >
                    <LogInIcon aria-hidden="true" className="size-4" />
                    Sign in
                  </button>
                )}
              </div>
            </nav>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
