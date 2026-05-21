"use client";

import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import { ChevronDownIcon, XMarkIcon } from "@heroicons/react/24/outline";
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
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      {/* Header */}
      <div className="flex h-[72px] shrink-0 items-center justify-between border-[#d0d5dd] border-b pr-[20px] pl-[24px]">
        <Image
          alt="Grenada Meteorological Service"
          height={36}
          priority
          src="/gmslogos/logo-primary-navy.png"
          width={150}
        />
        <button
          aria-label="Close navigation"
          className="flex size-[44px] items-center justify-center"
          onClick={onClose}
          type="button"
        >
          <XMarkIcon className="size-[24px] text-gray-900" />
        </button>
      </div>

      {/* Brand accent line */}
      <div className="flex h-[4px] w-full shrink-0">
        <div className="h-full flex-[55] bg-gm-blue" />
        <div className="h-full flex-[25] bg-gm-sky" />
        <div className="h-full flex-[20] bg-gm-sun" />
      </div>

      {/* Nav body */}
      <nav className="flex-1 overflow-y-auto pb-[36px]">
        {NAV_SECTIONS.map((section, i) => (
          <Disclosure key={section.label}>
            {({ open: sectionOpen }) => (
              <>
                <DisclosureButton
                  className={cn(
                    "flex h-[72px] w-full items-center justify-between pr-[20px] pl-[24px]",
                    i > 0 && "border-[#d0d5dd] border-t"
                  )}
                >
                  <span
                    className={cn(
                      "text-[30px] leading-[36px]",
                      sectionOpen
                        ? "font-semibold text-gm-navy"
                        : "font-normal text-[#111827]"
                    )}
                  >
                    {section.label}
                  </span>
                  <div className="flex size-[44px] items-center justify-center">
                    <ChevronDownIcon
                      className={cn(
                        "size-[24px] transition-transform duration-150",
                        sectionOpen
                          ? "rotate-180 text-gm-navy"
                          : "text-gray-400"
                      )}
                    />
                  </div>
                </DisclosureButton>

                {section.links.length > 0 && (
                  <DisclosurePanel>
                    {section.links.map((link) => (
                      <a
                        className="flex h-[44px] items-center pr-[20px] pl-[42px] text-[#111827] text-[20px] leading-[28px] hover:text-gm-navy"
                        href={link.href}
                        key={link.name}
                        onClick={onClose}
                      >
                        {link.name}
                      </a>
                    ))}
                  </DisclosurePanel>
                )}
              </>
            )}
          </Disclosure>
        ))}
      </nav>
    </div>
  );
}
