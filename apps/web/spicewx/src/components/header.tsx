"use client";

import {
  Disclosure,
  DisclosureButton,
  DisclosurePanel,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from "@headlessui/react";
import { Bars3Icon, BellIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import { cn } from "@/lib/utils";

const navigation = [
  { name: "Weather and Climate", href: "/weather", current: true },
  { name: "Products & Services", href: "/products", current: false },
  { name: "Resources", href: "/resources", current: false },
  { name: "About Us", href: "/about", current: false },
];

const userNavigation = [
  { name: "Your profile", href: "/profile" },
  { name: "Settings", href: "/settings" },
  { name: "Sign out", href: "/sign-out" },
];

export function Header() {
  return (
    <Disclosure as="nav" className="mb-4 border-gm-border border-b bg-white">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 justify-between">
          <div className="flex">
            <div className="flex shrink-0 items-center">
              {/* Mobile: submark */}
              <Image
                alt="Grenada Meteorological Service"
                className="sm:hidden block"
                height={40}
                src="/gmslogos/logo-primary-navy.png"
                width={180}
              />
              {/* Desktop: full primary logo */}
              <Image
                alt="Grenada Meteorological Service"
                className="hidden sm:block"
                height={40}
                src="/gmslogos/logo-primary-navy.png"
                width={180}
              />
            </div>
            <div className="hidden sm:-my-px sm:ml-8 sm:flex sm:space-x-6">
              {navigation.map((item) => (
                <a
                  aria-current={item.current ? "page" : undefined}
                  className={cn(
                    item.current
                      ? "border-gm-blue text-gm-navy"
                      : "border-transparent text-muted-foreground hover:border-gm-border hover:text-gm-navy",
                    "inline-flex items-center border-b-2 px-1 pt-1 font-medium text-sm transition-colors",
                  )}
                  href={item.href}
                  key={item.name}
                >
                  {item.name}
                </a>
              ))}
            </div>
          </div>

          <div className="hidden sm:ml-6 sm:flex sm:items-center">
            <button
              className="relative rounded-full p-1 text-muted-foreground transition-colors hover:text-gm-navy focus:outline-2 focus:outline-gm-sky focus:outline-offset-2"
              type="button"
            >
              <span className="absolute -inset-1.5" />
              <span className="sr-only">View notifications</span>
              <BellIcon aria-hidden="true" className="size-6" />
            </button>

            <Menu as="div" className="relative ml-3">
              <MenuButton className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gm-navy font-bold text-sm text-white focus-visible:outline-2 focus-visible:outline-gm-sky focus-visible:outline-offset-2">
                <span className="absolute -inset-1.5" />
                <span className="sr-only">Open user menu</span>U
              </MenuButton>
              <MenuItems
                className="absolute right-0 z-10 mt-2 w-48 origin-top-right rounded-md bg-white py-1 shadow-lg outline outline-black/5 transition data-closed:scale-95 data-closed:opacity-0 data-enter:duration-200 data-leave:duration-75 data-enter:ease-out data-leave:ease-in"
                transition
              >
                {userNavigation.map((item) => (
                  <MenuItem key={item.name}>
                    <a
                      className="block px-4 py-2 text-gray-700 text-sm data-focus:bg-gm-surface data-focus:outline-hidden"
                      href={item.href}
                    >
                      {item.name}
                    </a>
                  </MenuItem>
                ))}
              </MenuItems>
            </Menu>
          </div>

          <div className="-mr-2 flex items-center sm:hidden">
            <DisclosureButton className="group relative inline-flex items-center justify-center rounded-md p-2 text-muted-foreground transition-colors hover:bg-gm-surface hover:text-gm-navy focus:outline-2 focus:outline-gm-sky focus:outline-offset-2">
              <span className="absolute -inset-0.5" />
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

      <DisclosurePanel className="border-gm-border border-t bg-white sm:hidden">
        <div className="space-y-1 pt-2 pb-3">
          {navigation.map((item) => (
            <DisclosureButton
              aria-current={item.current ? "page" : undefined}
              as="a"
              className={cn(
                item.current
                  ? "border-gm-blue bg-gm-surface text-gm-navy"
                  : "border-transparent text-muted-foreground hover:border-gm-border hover:bg-gm-surface hover:text-gm-navy",
                "block border-l-4 py-2 pr-4 pl-3 font-medium text-base transition-colors",
              )}
              href={item.href}
              key={item.name}
            >
              {item.name}
            </DisclosureButton>
          ))}
        </div>
      </DisclosurePanel>
    </Disclosure>
  );
}
