"use client";

import { Accordion } from "@base-ui/react/accordion";
import { ChevronDownIcon, XIcon } from "lucide-react";
import Image from "next/image";
import { useEffect } from "react";
import { cn } from "@/lib/utils";

const NAV_SECTIONS = [
  {
    label: "Warnings",
    links: [
      { name: "Current alerts", href: "/warnings" },
      { name: "Weather Advisories", href: "/warnings/advisories" },
      { name: "Impact-Based Warnings", href: "/warnings/impact" },
      { name: "Tropical Cyclone Information", href: "/warnings/cyclone" },
      { name: "Marine Warnings", href: "/warnings/marine" },
      { name: "Warning Levels Explained", href: "/warnings/levels" },
    ],
  },
  {
    label: "Forecasts",
    links: [
      { name: "Today's Forecast", href: "/" },
      { name: "3-Day Forecast", href: "/forecasts/3-day" },
      { name: "7-Day Outlook", href: "/forecasts/7-day" },
      { name: "Weather Synopsis", href: "/forecasts/synopsis" },
      { name: "Radar", href: "/forecasts/radar" },
      { name: "Satellite", href: "/forecasts/satellite" },
      { name: "Current Conditions", href: "/forecasts/conditions" },
    ],
  },
  {
    label: "Marine",
    links: [
      { name: "Marine Forecast", href: "/marine/forecast" },
      { name: "Coastal Waters Forecast", href: "/marine/coastal" },
      { name: "Sea Conditions", href: "/marine/sea-conditions" },
      { name: "Wave / Swell Forecast", href: "/marine/wave-swell" },
      { name: "Tide Information", href: "/marine/tides" },
      { name: "Small Craft Advisories", href: "/marine/small-craft" },
      { name: "Marine Safety", href: "/marine/safety" },
    ],
  },
  {
    label: "Sectors",
    links: [
      { name: "Aviation", href: "/sectors/aviation" },
      { name: "Disaster Management", href: "/sectors/disaster-management" },
      { name: "Agriculture", href: "/sectors/agriculture" },
      { name: "Tourism & Events", href: "/sectors/tourism" },
      { name: "Construction", href: "/sectors/construction" },
      { name: "Education", href: "/sectors/education" },
      { name: "Health", href: "/sectors/health" },
    ],
  },
  {
    label: "Climate & Data",
    links: [
      { name: "Monthly Climate Summary", href: "/climate/monthly" },
      { name: "Rainfall Data", href: "/climate/rainfall" },
      { name: "Temperature Data", href: "/climate/temperature" },
      { name: "Historical Weather Data", href: "/climate/historical" },
      { name: "Climate Normals", href: "/climate/normals" },
      { name: "Seasonal Outlook", href: "/climate/seasonal" },
      { name: "Drought Monitoring", href: "/climate/drought" },
      { name: "Data Request Form", href: "/climate/data-request" },
      { name: "Publications", href: "/climate/publications" },
    ],
  },
  {
    label: "Resources",
    links: [
      { name: "Weather Glossary", href: "/resources/glossary" },
      { name: "Understanding Warnings", href: "/resources/warnings-guide" },
      { name: "Hurricane Preparedness", href: "/resources/hurricane" },
      { name: "Flood Preparedness", href: "/resources/flood" },
      { name: "Marine Safety", href: "/resources/marine-safety" },
      { name: "School Resources", href: "/resources/school" },
      { name: "FAQs", href: "/resources/faqs" },
      { name: "Downloads", href: "/resources/downloads" },
    ],
  },
  {
    label: "About",
    links: [],
  },
];

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
      <div className="flex h-gm-header shrink-0 items-center justify-between border-gm-border border-b pr-gm-20 pl-gm-24">
        <Image
          alt="Grenada Meteorological Service"
          height={36}
          priority
          src="/gmslogos/logo-primary-navy.png"
          width={150}
        />
        <button
          aria-label="Close navigation"
          className="flex size-gm-44 items-center justify-center"
          onClick={onClose}
          type="button"
        >
          <XIcon className="size-gm-24 text-gm-text-primary" />
        </button>
      </div>

      {/* Brand accent line */}
      <div className="flex h-gm-4 w-full shrink-0">
        <div className="h-full flex-[55] bg-gm-blue" />
        <div className="h-full flex-[25] bg-gm-sky" />
        <div className="h-full flex-[20] bg-gm-sun" />
      </div>

      {/* Nav body */}
      <nav className="flex-1 overflow-y-auto pb-gm-36">
        <Accordion.Root multiple>
          {NAV_SECTIONS.map((section, i) => (
            <Accordion.Item key={section.label} value={section.label}>
              <Accordion.Header className="flex">
                <Accordion.Trigger
                  className={cn(
                    "group flex h-gm-header w-full items-center justify-between pr-gm-20 pl-gm-24",
                    i > 0 && "border-gm-border border-t"
                  )}
                >
                  <span className="font-normal text-gm-heading-md text-gm-text-primary leading-gm-heading-md group-data-[open]:font-semibold group-data-[open]:text-gm-navy">
                    {section.label}
                  </span>
                  <div className="flex size-gm-44 items-center justify-center">
                    <ChevronDownIcon className="size-gm-24 text-gm-text-muted transition-transform duration-150 group-data-[open]:rotate-180 group-data-[open]:text-gm-navy" />
                  </div>
                </Accordion.Trigger>
              </Accordion.Header>
              {section.links.length > 0 && (
                <Accordion.Panel
                  className="overflow-hidden transition-[height] duration-200 ease-out"
                  style={
                    {
                      height: "var(--accordion-panel-height, 0)",
                    } as React.CSSProperties
                  }
                >
                  {section.links.map((link) => (
                    <a
                      className="flex h-gm-44 items-center pr-gm-20 pl-gm-40 text-gm-nav text-gm-text-primary leading-gm-nav hover:text-gm-navy"
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
