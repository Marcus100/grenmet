"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSidebar } from "../context/SidebarContext";
import {
  CalenderIcon,
  ChevronDownIcon,
  GridIcon,
  HorizontaLDots,
  ListIcon,
  PieChartIcon,
  PlugInIcon,
  UserCircleIcon,
} from "../icons/index";

interface SubItem {
  name: string;
  new?: boolean;
  path: string;
  pro?: boolean;
}

interface NavItem {
  icon: React.ReactNode;
  name: string;
  path?: string;
  subItems?: SubItem[];
}
const navItems: NavItem[] = [
  {
    icon: <GridIcon />,
    name: "Home",
    path: "/",
  },
  {
    icon: <CalenderIcon />,
    name: "Calendar",
    path: "/calendar",
  },
  {
    icon: <CalenderIcon />,
    name: "Roster",
    path: "/roster",
  },
  // {
  //   icon: <GridIcon />,
  //   name: "Dashboard",
  //   subItems: [{ name: "Ecommerce", path: "/", pro: false }],
  // },

  {
    icon: <UserCircleIcon />,
    name: "User Profile",
    path: "/profile",
  },

  {
    name: "Human Resource",
    icon: <ListIcon />,
    path: "/hr",
  },
  {
    name: "SalesBus",
    icon: <GridIcon />,
    subItems: [
      { name: "Sales", path: "/salesbus/sales", pro: false },
      { name: "Inventory", path: "/salesbus/inventory", pro: false },
      { name: "Settlements", path: "/salesbus/settlements", pro: false },
    ],
  },
  // {
  //   name: "Tables",
  //   icon: <TableIcon />,
  //   subItems: [{ name: "Basic Tables", path: "/basic-tables", pro: false }],
  // },
  // {
  //   name: "Pages",
  //   icon: <PageIcon />,
  //   subItems: [
  //     { name: "Blank Page", path: "/blank", pro: false },
  //     { name: "404 Error", path: "/error-404", pro: false },
  //   ],
  // },
];

const othersItems: NavItem[] = [
  {
    icon: <ListIcon />,
    name: "CAP Alerts",
    subItems: [
      { name: "Alerts", path: "/cap", pro: false },
      { name: "Alert Map", path: "/cap/map", pro: false },
      { name: "Feeds", path: "/cap/integrations", pro: false },
      { name: "Editor", path: "/cap/admin", pro: false },
    ],
  },
  {
    icon: <PieChartIcon />,
    name: "WxWatch",
    path: "/wxwatch",
  },
  // {
  //   icon: <BoxCubeIcon />,
  //   name: "UI Elements",
  //   subItems: [
  //     { name: "Alerts", path: "/alerts", pro: false },
  //     { name: "Avatar", path: "/avatars", pro: false },
  //     { name: "Badge", path: "/badge", pro: false },
  //     { name: "Buttons", path: "/buttons", pro: false },
  //     { name: "Images", path: "/images", pro: false },
  //     { name: "Videos", path: "/videos", pro: false },
  //   ],
  // },
  {
    icon: <PlugInIcon />,
    name: "Public Forecasts",
    subItems: [
      { name: "Hourly", path: "/wxproducts/hourly", pro: false },
      { name: "Morning", path: "/wxproducts/fcsts/morning", pro: false },
      { name: "Midday", path: "/wxproducts/fcsts/midday", pro: false },
      { name: "Evening", path: "/wxproducts/fcsts/evening", pro: false },
    ],
  },
  {
    icon: <PlugInIcon />,
    name: "Bulletins",
    subItems: [
      {
        name: "Marine Bulletin",
        path: "/wxproducts/bulletins/marine",
        pro: false,
      },
    ],
  },
];

function findActiveSubmenu(
  isActive: (path: string) => boolean
): { type: "admin" | "weather"; index: number } | null {
  const menuGroups: Array<{ type: "admin" | "weather"; items: NavItem[] }> = [
    { type: "admin", items: navItems },
    { type: "weather", items: othersItems },
  ];
  for (const { type, items } of menuGroups) {
    for (let index = 0; index < items.length; index++) {
      const nav = items[index];
      if (nav.subItems) {
        for (const subItem of nav.subItems) {
          if (isActive(subItem.path)) {
            return { type, index };
          }
        }
      }
    }
  }
  return null;
}

const AppSidebar: React.FC = () => {
  const { isExpanded, isMobileOpen, isHovered, setIsHovered } = useSidebar();
  const pathname = usePathname();

  const renderMenuItems = (
    navItems: NavItem[],
    menuType: "admin" | "weather"
  ) => (
    <ul className="flex flex-col gap-1">
      {/* biome-ignore lint/complexity/noExcessiveCognitiveComplexity: sidebar menu renderer with sub-items, badges, and active states */}
      {navItems.map((nav, index) => (
        <li key={nav.name}>
          {nav.subItems ? (
            <button
              className={`menu-item group ${
                openSubmenu?.type === menuType && openSubmenu?.index === index
                  ? "menu-item-active"
                  : "menu-item-inactive"
              } cursor-pointer ${
                isExpanded || isHovered
                  ? "lg:justify-start"
                  : "lg:justify-center"
              }`}
              onClick={() => handleSubmenuToggle(index, menuType)}
              type="button"
            >
              <span
                className={` ${
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? "menu-item-icon-active"
                    : "menu-item-icon-inactive"
                }`}
              >
                {nav.icon}
              </span>
              {(isExpanded || isHovered || isMobileOpen) && (
                <span className={"menu-item-text"}>{nav.name}</span>
              )}
              {(isExpanded || isHovered || isMobileOpen) && (
                <ChevronDownIcon
                  className={`ml-auto h-5 w-5 transition-transform duration-200 ${
                    openSubmenu?.type === menuType &&
                    openSubmenu?.index === index
                      ? "rotate-180 text-brand-500"
                      : ""
                  }`}
                />
              )}
            </button>
          ) : (
            nav.path && (
              <Link
                className={`menu-item group ${
                  isActive(nav.path) ? "menu-item-active" : "menu-item-inactive"
                }`}
                href={nav.path}
              >
                <span
                  className={`${
                    isActive(nav.path)
                      ? "menu-item-icon-active"
                      : "menu-item-icon-inactive"
                  }`}
                >
                  {nav.icon}
                </span>
                {(isExpanded || isHovered || isMobileOpen) && (
                  <span className={"menu-item-text"}>{nav.name}</span>
                )}
              </Link>
            )
          )}
          {nav.subItems && (isExpanded || isHovered || isMobileOpen) && (
            <div
              className="overflow-hidden transition-all duration-300"
              ref={(el) => {
                subMenuRefs.current[`${menuType}-${index}`] = el;
              }}
              style={{
                height:
                  openSubmenu?.type === menuType && openSubmenu?.index === index
                    ? `${subMenuHeight[`${menuType}-${index}`]}px`
                    : "0px",
              }}
            >
              <ul className="mt-2 ml-9 space-y-1">
                {nav.subItems.map((subItem) => (
                  <li key={subItem.name}>
                    <Link
                      className={`menu-dropdown-item ${
                        isActive(subItem.path)
                          ? "menu-dropdown-item-active"
                          : "menu-dropdown-item-inactive"
                      }`}
                      href={subItem.path}
                    >
                      {subItem.name}
                      <span className="ml-auto flex items-center gap-1">
                        {subItem.new && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            new
                          </span>
                        )}
                        {subItem.pro && (
                          <span
                            className={`ml-auto ${
                              isActive(subItem.path)
                                ? "menu-dropdown-badge-active"
                                : "menu-dropdown-badge-inactive"
                            } menu-dropdown-badge`}
                          >
                            pro
                          </span>
                        )}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </li>
      ))}
    </ul>
  );

  const [openSubmenu, setOpenSubmenu] = useState<{
    type: "admin" | "weather";
    index: number;
  } | null>(null);
  const [subMenuHeight, setSubMenuHeight] = useState<Record<string, number>>(
    {}
  );
  const subMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // const isActive = (path: string) => path === pathname;
  const isActive = useCallback((path: string) => path === pathname, [pathname]);

  useEffect(() => {
    // Check if the current path matches any submenu item
    const matched = findActiveSubmenu(isActive);
    setOpenSubmenu(matched);
  }, [isActive]);

  useEffect(() => {
    // Set the height of the submenu items when the submenu is opened
    if (openSubmenu !== null) {
      const key = `${openSubmenu.type}-${openSubmenu.index}`;
      if (subMenuRefs.current[key]) {
        setSubMenuHeight((prevHeights) => ({
          ...prevHeights,
          [key]: subMenuRefs.current[key]?.scrollHeight || 0,
        }));
      }
    }
  }, [openSubmenu]);

  const handleSubmenuToggle = (
    index: number,
    menuType: "admin" | "weather"
  ) => {
    setOpenSubmenu((prevOpenSubmenu) => {
      if (
        prevOpenSubmenu &&
        prevOpenSubmenu.type === menuType &&
        prevOpenSubmenu.index === index
      ) {
        return null;
      }
      return { type: menuType, index };
    });
  };

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementInteractions: mouse hover events for collapsible sidebar
    <aside
      className={`fixed top-0 left-0 z-50 mt-16 flex h-screen flex-col border-border border-r bg-background px-5 text-foreground transition-all duration-300 ease-in-out lg:mt-0 ${
        isExpanded || isMobileOpen || isHovered ? "w-[290px]" : "w-[90px]"
      }
        ${isMobileOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0`}
      onMouseEnter={() => !isExpanded && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={`flex py-2 ${
          isExpanded || isHovered ? "justify-center" : "lg:justify-center"
        }`}
      >
        <Link href="/">
          {isExpanded || isHovered || isMobileOpen ? (
            <Image
              alt="Logo"
              height={10}
              src="/images/logo/spicewxlogo.svg"
              width={120}
            />
          ) : (
            <Image
              alt="Logo"
              height={32}
              src="/images/logo/logo-icon.svg"
              width={32}
            />
          )}
        </Link>
      </div>
      <div className="no-scrollbar flex flex-col overflow-y-auto duration-300 ease-linear">
        <nav className="mb-6">
          <div className="flex flex-col gap-4">
            <div>
              <h2
                className={`mb-4 flex text-gray-400 text-xs uppercase leading-gm-nav ${
                  isExpanded || isHovered
                    ? "justify-start"
                    : "lg:justify-center"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Admin"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(navItems, "admin")}
            </div>

            <div className="">
              <h2
                className={`mb-4 flex text-gray-400 text-xs uppercase leading-gm-nav ${
                  isExpanded || isHovered
                    ? "justify-start"
                    : "lg:justify-center"
                }`}
              >
                {isExpanded || isHovered || isMobileOpen ? (
                  "Weather"
                ) : (
                  <HorizontaLDots />
                )}
              </h2>
              {renderMenuItems(othersItems, "weather")}
            </div>
          </div>
        </nav>
        {/* {isExpanded || isHovered || isMobileOpen ? <SidebarWidget /> : null} */}
      </div>
    </aside>
  );
};

export default AppSidebar;
