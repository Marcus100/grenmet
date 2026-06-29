"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

export default function NotificationDropdown() {
  const [isOpen, setIsOpen] = useState(false);
  const [notifying, setNotifying] = useState(true);
  const panelRef = useRef<HTMLDivElement>(null);

  const closeDropdown = useCallback(() => setIsOpen(false), []);

  function toggleDropdown() {
    setIsOpen((prev) => !prev);
  }

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest(".notification-toggle")
      ) {
        closeDropdown();
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, closeDropdown]);

  const handleClick = () => {
    toggleDropdown();
    setNotifying(false);
  };
  return (
    <div className="relative">
      <button
        className="notification-toggle relative flex h-11 w-11 items-center justify-center rounded-full border border-border bg-background text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onClick={handleClick}
        type="button"
      >
        <span
          className={`absolute top-0.5 right-0 z-10 h-2 w-2 rounded-full bg-orange-400 ${
            notifying ? "flex" : "hidden"
          }`}
        >
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
        </span>
        <svg
          aria-hidden="true"
          className="fill-current"
          height="20"
          viewBox="0 0 20 20"
          width="20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            clipRule="evenodd"
            d="M10.75 2.29248C10.75 1.87827 10.4143 1.54248 10 1.54248C9.58583 1.54248 9.25004 1.87827 9.25004 2.29248V2.83613C6.08266 3.20733 3.62504 5.9004 3.62504 9.16748V14.4591H3.33337C2.91916 14.4591 2.58337 14.7949 2.58337 15.2091C2.58337 15.6234 2.91916 15.9591 3.33337 15.9591H4.37504H15.625H16.6667C17.0809 15.9591 17.4167 15.6234 17.4167 15.2091C17.4167 14.7949 17.0809 14.4591 16.6667 14.4591H16.375V9.16748C16.375 5.9004 13.9174 3.20733 10.75 2.83613V2.29248ZM14.875 14.4591V9.16748C14.875 6.47509 12.6924 4.29248 10 4.29248C7.30765 4.29248 5.12504 6.47509 5.12504 9.16748V14.4591H14.875ZM8.00004 17.7085C8.00004 18.1228 8.33583 18.4585 8.75004 18.4585H11.25C11.6643 18.4585 12 18.1228 12 17.7085C12 17.2943 11.6643 16.9585 11.25 16.9585H8.75004C8.33583 16.9585 8.00004 17.2943 8.00004 17.7085Z"
            fill="currentColor"
            fillRule="evenodd"
          />
        </svg>
      </button>
      {isOpen && (
        <div
          className="absolute -right-[240px] z-40 mt-[17px] flex h-[480px] w-[350px] flex-col rounded-2xl border border-border bg-background p-3 shadow-gm-card sm:w-[361px] lg:right-0"
          ref={panelRef}
        >
          <div className="mb-3 flex items-center justify-between border-border border-b pb-3">
            <h5 className="font-semibold text-foreground text-lg">
              Notification
            </h5>
            <button
              className="dropdown-toggle text-muted-foreground transition hover:text-foreground"
              onClick={toggleDropdown}
              type="button"
            >
              <svg
                aria-hidden="true"
                className="fill-current"
                height="24"
                viewBox="0 0 24 24"
                width="24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  clipRule="evenodd"
                  d="M6.21967 7.28131C5.92678 6.98841 5.92678 6.51354 6.21967 6.22065C6.51256 5.92775 6.98744 5.92775 7.28033 6.22065L11.999 10.9393L16.7176 6.22078C17.0105 5.92789 17.4854 5.92788 17.7782 6.22078C18.0711 6.51367 18.0711 6.98855 17.7782 7.28144L13.0597 12L17.7782 16.7186C18.0711 17.0115 18.0711 17.4863 17.7782 17.7792C17.4854 18.0721 17.0105 18.0721 16.7176 17.7792L11.999 13.0607L7.28033 17.7794C6.98744 18.0722 6.51256 18.0722 6.21967 17.7794C5.92678 17.4865 5.92678 17.0116 6.21967 16.7187L10.9384 12L6.21967 7.28131Z"
                  fill="currentColor"
                  fillRule="evenodd"
                />
              </svg>
            </button>
          </div>
          <ul className="custom-scrollbar flex h-auto flex-col overflow-y-auto">
            {/* Example notification items */}
            <li>
              <button
                className="flex gap-3 rounded-lg border-border border-b p-3 px-4.5 py-3 hover:bg-muted"
                onClick={closeDropdown}
                type="button"
              >
                <span className="relative z-1 block h-10 w-full max-w-10 rounded-full">
                  <Image
                    alt="User"
                    className="w-full overflow-hidden rounded-full"
                    height={40}
                    src="/images/user/user-02.jpg"
                    width={40}
                  />
                  <span className="absolute right-0 bottom-0 z-10 h-2.5 w-full max-w-2.5 rounded-full border-[1.5px] border-white bg-success-500" />
                </span>

                <span className="block">
                  <span className="mb-1.5 block space-x-1 text-muted-foreground text-theme-sm">
                    <span className="font-medium text-foreground">
                      Terry Franci
                    </span>
                    <span>requests permission to change</span>
                    <span className="font-medium text-foreground">
                      Project - Nganter App
                    </span>
                  </span>

                  <span className="flex items-center gap-2 text-muted-foreground text-theme-xs">
                    <span>Project</span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                    <span>5 min ago</span>
                  </span>
                </span>
              </button>
            </li>

            <li>
              <button
                className="flex gap-3 rounded-lg border-border border-b p-3 px-4.5 py-3 hover:bg-muted"
                onClick={closeDropdown}
                type="button"
              >
                <span className="relative z-1 block h-10 w-full max-w-10 rounded-full">
                  <Image
                    alt="User"
                    className="w-full overflow-hidden rounded-full"
                    height={40}
                    src="/images/user/user-03.jpg"
                    width={40}
                  />
                  <span className="absolute right-0 bottom-0 z-10 h-2.5 w-full max-w-2.5 rounded-full border-[1.5px] border-white bg-success-500" />
                </span>

                <span className="block">
                  <span className="mb-1.5 block space-x-1 text-muted-foreground text-theme-sm">
                    <span className="font-medium text-foreground">
                      Alena Franci
                    </span>
                    <span> requests permission to change</span>
                    <span className="font-medium text-foreground">
                      Project - Nganter App
                    </span>
                  </span>

                  <span className="flex items-center gap-2 text-muted-foreground text-theme-xs">
                    <span>Project</span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                    <span>8 min ago</span>
                  </span>
                </span>
              </button>
            </li>

            <li>
              <button
                className="flex gap-3 rounded-lg border-border border-b p-3 px-4.5 py-3 hover:bg-muted"
                onClick={closeDropdown}
                type="button"
              >
                <span className="relative z-1 block h-10 w-full max-w-10 rounded-full">
                  <Image
                    alt="User"
                    className="w-full overflow-hidden rounded-full"
                    height={40}
                    src="/images/user/user-04.jpg"
                    width={40}
                  />
                  <span className="absolute right-0 bottom-0 z-10 h-2.5 w-full max-w-2.5 rounded-full border-[1.5px] border-white bg-success-500" />
                </span>

                <span className="block">
                  <span className="mb-1.5 block space-x-1 text-muted-foreground text-theme-sm">
                    <span className="font-medium text-foreground">
                      Jocelyn Kenter
                    </span>
                    <span>requests permission to change</span>
                    <span className="font-medium text-foreground">
                      Project - Nganter App
                    </span>
                  </span>

                  <span className="flex items-center gap-2 text-muted-foreground text-theme-xs">
                    <span>Project</span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                    <span>15 min ago</span>
                  </span>
                </span>
              </button>
            </li>

            <li>
              <button
                className="flex gap-3 rounded-lg border-border border-b p-3 px-4.5 py-3 hover:bg-muted"
                onClick={closeDropdown}
                type="button"
              >
                <span className="relative z-1 block h-10 w-full max-w-10 rounded-full">
                  <Image
                    alt="User"
                    className="w-full overflow-hidden rounded-full"
                    height={40}
                    src="/images/user/user-05.jpg"
                    width={40}
                  />
                  <span className="absolute right-0 bottom-0 z-10 h-2.5 w-full max-w-2.5 rounded-full border-[1.5px] border-white bg-error-500" />
                </span>

                <span className="block">
                  <span className="mb-1.5 block space-x-1 text-muted-foreground text-theme-sm">
                    <span className="font-medium text-foreground">
                      Brandon Philips
                    </span>
                    <span> requests permission to change</span>
                    <span className="font-medium text-foreground">
                      Project - Nganter App
                    </span>
                  </span>

                  <span className="flex items-center gap-2 text-muted-foreground text-theme-xs">
                    <span>Project</span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                    <span>1 hr ago</span>
                  </span>
                </span>
              </button>
            </li>

            <li>
              <button
                className="flex gap-3 rounded-lg border-border border-b p-3 px-4.5 py-3 hover:bg-muted"
                onClick={closeDropdown}
                type="button"
              >
                <span className="relative z-1 block h-10 w-full max-w-10 rounded-full">
                  <Image
                    alt="User"
                    className="w-full overflow-hidden rounded-full"
                    height={40}
                    src="/images/user/user-02.jpg"
                    width={40}
                  />
                  <span className="absolute right-0 bottom-0 z-10 h-2.5 w-full max-w-2.5 rounded-full border-[1.5px] border-white bg-success-500" />
                </span>

                <span className="block">
                  <span className="mb-1.5 block space-x-1 text-muted-foreground text-theme-sm">
                    <span className="font-medium text-foreground">
                      Terry Franci
                    </span>
                    <span>requests permission to change</span>
                    <span className="font-medium text-foreground">
                      Project - Nganter App
                    </span>
                  </span>

                  <span className="flex items-center gap-2 text-muted-foreground text-theme-xs">
                    <span>Project</span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                    <span>5 min ago</span>
                  </span>
                </span>
              </button>
            </li>

            <li>
              <button
                className="flex gap-3 rounded-lg border-border border-b p-3 px-4.5 py-3 hover:bg-muted"
                onClick={closeDropdown}
                type="button"
              >
                <span className="relative z-1 block h-10 w-full max-w-10 rounded-full">
                  <Image
                    alt="User"
                    className="w-full overflow-hidden rounded-full"
                    height={40}
                    src="/images/user/user-03.jpg"
                    width={40}
                  />
                  <span className="absolute right-0 bottom-0 z-10 h-2.5 w-full max-w-2.5 rounded-full border-[1.5px] border-white bg-success-500" />
                </span>

                <span className="block">
                  <span className="mb-1.5 block space-x-1 text-muted-foreground text-theme-sm">
                    <span className="font-medium text-foreground">
                      Alena Franci
                    </span>
                    <span>requests permission to change</span>
                    <span className="font-medium text-foreground">
                      Project - Nganter App
                    </span>
                  </span>

                  <span className="flex items-center gap-2 text-muted-foreground text-theme-xs">
                    <span>Project</span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                    <span>8 min ago</span>
                  </span>
                </span>
              </button>
            </li>

            <li>
              <button
                className="flex gap-3 rounded-lg border-border border-b p-3 px-4.5 py-3 hover:bg-muted"
                onClick={closeDropdown}
                type="button"
              >
                <span className="relative z-1 block h-10 w-full max-w-10 rounded-full">
                  <Image
                    alt="User"
                    className="w-full overflow-hidden rounded-full"
                    height={40}
                    src="/images/user/user-04.jpg"
                    width={40}
                  />
                  <span className="absolute right-0 bottom-0 z-10 h-2.5 w-full max-w-2.5 rounded-full border-[1.5px] border-white bg-success-500" />
                </span>

                <span className="block">
                  <span className="mb-1.5 block space-x-1 text-muted-foreground text-theme-sm">
                    <span className="font-medium text-foreground">
                      Jocelyn Kenter
                    </span>
                    <span>requests permission to change</span>
                    <span className="font-medium text-foreground">
                      Project - Nganter App
                    </span>
                  </span>

                  <span className="flex items-center gap-2 text-muted-foreground text-theme-xs">
                    <span>Project</span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                    <span>15 min ago</span>
                  </span>
                </span>
              </button>
            </li>

            <li>
              <button
                className="flex gap-3 rounded-lg border-border border-b p-3 px-4.5 py-3 hover:bg-muted"
                onClick={closeDropdown}
                type="button"
              >
                <span className="relative z-1 block h-10 w-full max-w-10 rounded-full">
                  <Image
                    alt="User"
                    className="overflow-hidden rounded-full"
                    height={40}
                    src="/images/user/user-05.jpg"
                    width={40}
                  />
                  <span className="absolute right-0 bottom-0 z-10 h-2.5 w-full max-w-2.5 rounded-full border-[1.5px] border-white bg-error-500" />
                </span>

                <span className="block">
                  <span className="mb-1.5 block space-x-1 text-muted-foreground text-theme-sm">
                    <span className="font-medium text-foreground">
                      Brandon Philips
                    </span>
                    <span>requests permission to change</span>
                    <span className="font-medium text-foreground">
                      Project - Nganter App
                    </span>
                  </span>

                  <span className="flex items-center gap-2 text-muted-foreground text-theme-xs">
                    <span>Project</span>
                    <span className="h-1 w-1 rounded-full bg-muted-foreground" />
                    <span>1 hr ago</span>
                  </span>
                </span>
              </button>
            </li>
            {/* Add more items as needed */}
          </ul>
          <Link
            className="mt-3 block rounded-lg border border-border bg-background px-4 py-2 text-center font-medium text-foreground text-sm hover:bg-muted"
            href="/"
          >
            View All Notifications
          </Link>
        </div>
      )}
    </div>
  );
}
