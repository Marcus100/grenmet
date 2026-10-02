"use client";

import { cn } from "@barrelsgd/ui/lib/utils";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { isCurrent, isGroup, NAV } from "@/lib/nav";

const MENU_ID = "site-menu";

const ROW =
  "flex min-h-13 items-center border-el-rule border-b px-4 font-semibold font-serif text-el-ink text-xl aria-[current=page]:underline aria-[current=page]:decoration-2 aria-[current=page]:underline-offset-6";
const SUB_ROW =
  "flex min-h-11 items-center px-4 text-base text-el-ink-2 hover:bg-el-paper-2 aria-[current=page]:font-semibold aria-[current=page]:text-el-ink";

/**
 * Below `lg`: a hamburger whose bars fold into an X and opens one panel
 * under the masthead: the election status, the main pages as large rows,
 * then the More pages.
 */
export function MobileMenu({ status }: { status?: string }) {
  const [open, setOpen] = useState(false);
  const [top, setTop] = useState(0);
  const button = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();

  // A link to another page closes the menu.
  // biome-ignore lint/correctness/useExhaustiveDependencies: run on route change only
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function toggle() {
    const header = button.current?.closest("header");
    if (header) setTop(header.getBoundingClientRect().bottom);
    setOpen((was) => !was);
  }

  const close = () => setOpen(false);

  return (
    <>
      <button
        aria-controls={MENU_ID}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="-mr-2 flex size-11 items-center justify-center rounded-md lg:hidden"
        onClick={toggle}
        ref={button}
        type="button"
      >
        <span aria-hidden="true" className="relative block h-3.5 w-6">
          {["top-0", "top-1.5", "top-3"].map((position, bar) => (
            <span
              className={cn(
                "absolute left-0 h-0.5 w-6 rounded-full bg-current transition duration-200 ease-out motion-reduce:transition-none",
                position,
                open && bar === 0 && "translate-y-1.5 rotate-45",
                open && bar === 1 && "scale-x-0 opacity-0",
                open && bar === 2 && "-translate-y-1.5 -rotate-45"
              )}
              key={position}
            />
          ))}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            animate={{ opacity: 1 }}
            aria-label="Site menu"
            className="fixed inset-x-0 bottom-0 z-30 flex flex-col overflow-y-auto border-el-ink border-t bg-background lg:hidden"
            exit={{ opacity: 0 }}
            id={MENU_ID}
            initial={{ opacity: 0 }}
            role="dialog"
            style={{ top }}
            transition={{ duration: 0.15 }}
          >
            {status && (
              <p className="border-el-rule border-b px-4 py-3 font-semibold text-el-ink-2 text-xs uppercase tracking-[0.08em]">
                {status}
              </p>
            )}
            <nav aria-label="Site sections" className="flex-1 pb-8">
              {NAV.map((item) =>
                isGroup(item) ? (
                  <section aria-label={item.label} key={item.label}>
                    <h2 className="px-4 pt-5 pb-1 font-sans font-semibold text-el-muted text-xs uppercase tracking-[0.07em]">
                      {item.label}
                    </h2>
                    <ul>
                      {item.links.map((link) => (
                        <li key={link.href}>
                          <Link
                            aria-current={
                              isCurrent(link.href, pathname)
                                ? "page"
                                : undefined
                            }
                            className={SUB_ROW}
                            href={link.href}
                            onClick={close}
                          >
                            {link.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : (
                  <Link
                    aria-current={
                      isCurrent(item.href, pathname) ? "page" : undefined
                    }
                    className={ROW}
                    href={item.href}
                    key={item.href}
                    onClick={close}
                  >
                    {item.label}
                  </Link>
                )
              )}
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
