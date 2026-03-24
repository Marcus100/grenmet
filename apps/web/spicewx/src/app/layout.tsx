import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
} from "@headlessui/react";
import { Bars3Icon, XMarkIcon } from "@heroicons/react/24/outline";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Grenada Meteorological Service",
  description:
    "Official weather forecasts, alerts, and bulletins for Grenada, Carriacou & Petite Martinique.",
};

const navigation = [
  { name: "Weather", href: "#", current: true },
  { name: "Alerts", href: "#", current: false },
  { name: "Products & Services", href: "#", current: false },
  { name: "Marine", href: "#", current: false },
  { name: "About", href: "#", current: false },
];

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background antialiased`}
      >
        <Disclosure
          as="header"
          className="sticky top-0 z-50 bg-sky-700 shadow-lg shadow-sky-900/30"
        >
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
            <div className="flex h-16 items-center justify-between">
              {/* Logo */}
              <div className="flex shrink-0 items-center gap-3">
                <SpiceWxLogo />
                <div className="leading-none">
                  <span className="block font-bold text-white text-xl tracking-tight">
                    SpiceWx
                  </span>
                  <span className="text-[11px] text-sky-200 uppercase tracking-wide">
                    Grenada Met Service
                  </span>
                </div>
              </div>

              {/* Desktop nav */}
              <nav className="hidden items-center gap-0.5 md:flex">
                {navigation.map((item) => (
                  <a
                    aria-current={item.current ? "page" : undefined}
                    className={
                      item.current
                        ? "rounded-lg bg-sky-800/70 px-3 py-2 font-semibold text-sm text-white"
                        : "rounded-lg px-3 py-2 font-medium text-sky-100 text-sm transition-colors hover:bg-sky-600/50 hover:text-white"
                    }
                    href={item.href}
                    key={item.name}
                  >
                    {item.name}
                  </a>
                ))}
              </nav>

              {/* Mobile menu button */}
              <div className="md:hidden">
                <DisclosureButton className="group inline-flex items-center justify-center rounded-lg p-2 text-sky-200 transition-colors hover:bg-sky-600/50 hover:text-white">
                  <span className="sr-only">Open main menu</span>
                  <Bars3Icon
                    aria-hidden="true"
                    className="block size-6 group-data-open:hidden"
                  />
                  <XMarkIcon
                    aria-hidden="true"
                    className="hidden size-6 group-data-open:block"
                  />
                </DisclosureButton>
              </div>
            </div>
          </div>

          {/* Mobile menu */}
          <DisclosurePanel className="border-sky-600/50 border-t md:hidden">
            <div className="space-y-1 px-3 py-3">
              {navigation.map((item) => (
                <DisclosureButton
                  aria-current={item.current ? "page" : undefined}
                  as="a"
                  className={
                    item.current
                      ? "block rounded-lg bg-sky-800/70 px-3 py-2 font-semibold text-base text-white"
                      : "block rounded-lg px-3 py-2 font-medium text-base text-sky-100 transition-colors hover:bg-sky-600/50 hover:text-white"
                  }
                  href={item.href}
                  key={item.name}
                >
                  {item.name}
                </DisclosureButton>
              ))}
            </div>
          </DisclosurePanel>
        </Disclosure>

        <main>{children}</main>

        <footer className="mt-16 bg-sky-900 text-sky-100">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="mb-4 flex items-center gap-2">
                  <SpiceWxLogo />
                  <span className="font-bold text-lg text-white">SpiceWx</span>
                </div>
                <p className="text-sky-300 text-sm leading-relaxed">
                  Official weather service for Grenada, Carriacou & Petite
                  Martinique.
                </p>
              </div>
              <div>
                <h3 className="mb-3 font-semibold text-sm text-white uppercase tracking-wider">
                  Forecasts
                </h3>
                <ul className="space-y-2 text-sky-300 text-sm">
                  {[
                    "Current Conditions",
                    "Hourly Forecast",
                    "7-Day Outlook",
                    "Marine Forecast",
                  ].map((l) => (
                    <li key={l}>
                      <a
                        className="transition-colors hover:text-white"
                        href="/"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-3 font-semibold text-sm text-white uppercase tracking-wider">
                  Products
                </h3>
                <ul className="space-y-2 text-sky-300 text-sm">
                  {[
                    "Marine Bulletin",
                    "Tropical Outlook",
                    "Climate Bulletin",
                    "Aviation Weather",
                  ].map((l) => (
                    <li key={l}>
                      <a
                        className="transition-colors hover:text-white"
                        href="/"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="mb-3 font-semibold text-sm text-white uppercase tracking-wider">
                  Information
                </h3>
                <ul className="space-y-2 text-sky-300 text-sm">
                  {[
                    "About Us",
                    "Contact",
                    "Data Policy",
                    "Emergency Contacts",
                  ].map((l) => (
                    <li key={l}>
                      <a
                        className="transition-colors hover:text-white"
                        href="/"
                      >
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="mt-10 flex flex-col items-center justify-between gap-3 border-sky-800 border-t pt-6 text-sky-400 text-xs sm:flex-row">
              <p>© 2026 Grenada Meteorological Service. All rights reserved.</p>
              <p>Data updated every 30 minutes · Last updated: 12:30 PM AST</p>
            </div>
          </div>
        </footer>
      </body>
    </html>
  );
}

function SpiceWxLogo() {
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-400 shadow-md">
      <svg aria-hidden="true" className="size-6" viewBox="0 0 36 36">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <line
            key={angle}
            stroke="#78350f"
            strokeLinecap="round"
            strokeWidth="2"
            transform={`rotate(${angle} 18 18)`}
            x1="18"
            x2="18"
            y1="2"
            y2="8"
          />
        ))}
        <circle cx="18" cy="18" fill="#78350f" r="8" />
        <circle cx="18" cy="18" fill="#fbbf24" r="6" />
      </svg>
    </div>
  );
}
