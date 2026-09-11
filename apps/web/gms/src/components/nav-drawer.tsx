"use client";

import { Logo } from "@barrelsgd/gms/components/logo";
import { Accordion } from "@base-ui/react/accordion";
import { ChevronDownIcon, XIcon } from "lucide-react";
import { useEffect } from "react";
import { NAV_SECTIONS } from "@/lib/nav-sections";
import { cn } from "@/lib/utils";

interface NavDrawerProps {
  onClose: () => void;
  open: boolean;
}

export function NavDrawer({ open, onClose }: NavDrawerProps) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Header */}
      <div className="flex h-header shrink-0 items-center justify-between border-gm-border border-b pr-5 pl-6">
        <Logo className="h-9 w-auto" priority variant="primary" />
        <button
          aria-label="Close navigation"
          className="flex size-11 items-center justify-center"
          onClick={onClose}
          type="button"
        >
          <XIcon className="size-6 text-gm-text-primary" />
        </button>
      </div>

      {/* Brand accent line */}
      <div className="flex h-1 w-full shrink-0">
        <div className="h-full flex-[55] bg-gm-blue" />
        <div className="h-full flex-[25] bg-gm-sky" />
        <div className="h-full flex-[20] bg-gm-lime" />
      </div>

      {/* Nav body */}
      <nav className="flex-1 overflow-y-auto pb-9">
        <Accordion.Root multiple>
          {NAV_SECTIONS.map((section, i) => (
            <Accordion.Item key={section.label} value={section.label}>
              <Accordion.Header className="flex">
                <Accordion.Trigger
                  className={cn(
                    "group flex h-header w-full items-center justify-between pr-5 pl-6",
                    i > 0 && "border-gm-border border-t"
                  )}
                >
                  {/* Base UI's Accordion.Trigger marks the open state with
                      data-panel-open, not data-open. */}
                  <span className="font-normal text-gm-text-primary text-heading-md leading-heading-md group-data-panel-open:font-semibold group-data-panel-open:text-gm-navy">
                    {section.label}
                  </span>
                  <div className="flex size-11 items-center justify-center">
                    <ChevronDownIcon className="size-6 text-gm-text-muted transition-transform duration-150 group-data-panel-open:rotate-180 group-data-panel-open:text-gm-navy" />
                  </div>
                </Accordion.Trigger>
              </Accordion.Header>
              {section.groups.length > 0 && (
                <Accordion.Panel
                  className="overflow-hidden transition-[height] duration-200 ease-out"
                  style={
                    {
                      height: "var(--accordion-panel-height, 0)",
                    } as React.CSSProperties
                  }
                >
                  {/* Group headings and descriptions mirror the desktop panel
                      so both surfaces present the same structure. */}
                  {section.groups.map((group) => (
                    <div className="pb-2" key={group.heading}>
                      <p className="px-6 pt-4 pb-1 font-semibold text-caption text-gm-text-muted uppercase leading-caption tracking-wider">
                        {group.heading}
                      </p>
                      {group.links.map((link) => (
                        <a
                          className="flex min-h-11 flex-col justify-center gap-0.5 py-2 pr-5 pl-10 hover:bg-gm-surface"
                          href={link.href}
                          key={link.href}
                          onClick={onClose}
                        >
                          <span className="font-medium text-body-base text-gm-text-primary leading-body-base">
                            {link.name}
                          </span>
                          <span className="text-body-sm text-gm-text-secondary leading-body-sm">
                            {link.description}
                          </span>
                        </a>
                      ))}
                    </div>
                  ))}
                </Accordion.Panel>
              )}
            </Accordion.Item>
          ))}
        </Accordion.Root>
      </nav>
    </div>
  );
}
