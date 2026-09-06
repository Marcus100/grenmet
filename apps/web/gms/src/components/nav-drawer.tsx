"use client";

import { Accordion } from "@base-ui/react/accordion";
import { ChevronDownIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useEffect } from "react";
import { NAV_SECTIONS, sectionLinks } from "@/lib/nav-sections";
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
        <Image
          alt="Grenada Meteorological Service"
          height={36}
          priority
          src="/gmslogos/logo-primary-navy.png"
          width={150}
        />
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
        <div className="h-full flex-[20] bg-gm-sun" />
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
                  <span className="font-normal text-gm-text-primary text-heading-md leading-heading-md group-data-[open]:font-semibold group-data-[open]:text-gm-navy">
                    {section.label}
                  </span>
                  <div className="flex size-11 items-center justify-center">
                    <ChevronDownIcon className="size-6 text-gm-text-muted transition-transform duration-150 group-data-[open]:rotate-180 group-data-[open]:text-gm-navy" />
                  </div>
                </Accordion.Trigger>
              </Accordion.Header>
              {sectionLinks(section).length > 0 && (
                <Accordion.Panel
                  className="overflow-hidden transition-[height] duration-200 ease-out"
                  style={
                    {
                      height: "var(--accordion-panel-height, 0)",
                    } as React.CSSProperties
                  }
                >
                  {sectionLinks(section).map((link) => (
                    <a
                      className="flex h-11 items-center pr-5 pl-10 text-gm-text-primary text-nav leading-nav hover:text-gm-navy"
                      href={link.href}
                      key={link.name}
                      onClick={onClose}
                    >
                      {link.name}
                    </a>
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
