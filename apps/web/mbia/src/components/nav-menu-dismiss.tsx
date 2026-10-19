"use client";

import { useEffect } from "react";

const OPEN_MENUS = "details[data-site-nav][open]";

/**
 * Closes open desktop mega-menus the way a popover would: on a pointer press
 * outside them, after a link inside them is followed, and on Escape (returning
 * focus to the menu's summary). Renders nothing.
 */
export function NavMenuDismiss() {
  useEffect(() => {
    const openMenus = () =>
      Array.from(document.querySelectorAll<HTMLDetailsElement>(OPEN_MENUS));

    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      for (const menu of openMenus()) {
        if (!menu.contains(event.target)) menu.open = false;
      }
    };

    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest("a")) return;
      for (const menu of openMenus()) {
        if (menu.contains(event.target)) menu.open = false;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const active = document.activeElement;
      for (const menu of openMenus()) {
        if (active && menu.contains(active)) {
          menu.open = false;
          menu.querySelector("summary")?.focus();
        }
      }
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return null;
}
