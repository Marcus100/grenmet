"use client";

import { type RefObject, useEffect } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(panel: HTMLElement): HTMLElement[] {
  return [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (element) => !element.closest("[inert]")
  );
}

/**
 * Marks everything outside `keep` inert, walking down only into the branches
 * that hold a kept element. Returns the elements it changed, to undo later.
 */
function inertOutside(root: Element, keep: readonly Element[]): Element[] {
  const changed: Element[] = [];
  for (const child of root.children) {
    if (keep.includes(child)) continue;
    if (keep.some((element) => child.contains(element))) {
      changed.push(...inertOutside(child, keep));
    } else if (!child.hasAttribute("inert")) {
      child.setAttribute("inert", "");
      changed.push(child);
    }
  }
  return changed;
}

/**
 * Focus handling for a full-screen mobile menu opened by a button that stays
 * visible above it (a header hamburger).
 *
 * While `open`: focus moves to the menu's first link, Tab and Shift+Tab cycle
 * through the menu button and the menu only, and the rest of the page is
 * `inert` so neither the keyboard nor a screen reader can reach what the menu
 * covers. The button stays reachable, so it still closes the menu. Closing
 * (Escape, the button, a link) is the caller's job, as is returning focus to
 * the button.
 */
export function useMenuFocus({
  buttonRef,
  onHidden,
  open,
  panelId,
}: {
  buttonRef: RefObject<HTMLElement | null>;
  /** Called if the button is hidden while open (a resize past its breakpoint). */
  onHidden: () => void;
  open: boolean;
  panelId: string;
}): void {
  useEffect(() => {
    const panel = document.getElementById(panelId);
    const button = buttonRef.current;
    if (!(open && panel && button)) return;

    const changed = inertOutside(document.body, [panel, button]);
    focusables(panel)[0]?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const order = [button, ...focusables(panel)];
      const first = order[0];
      const last = order.at(-1);
      const active = document.activeElement;
      if (event.shiftKey && active === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first?.focus();
      } else if (!order.some((element) => element === active)) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    // A menu whose button is hidden by a breakpoint cannot be closed by its
    // button, so it closes itself rather than leaving the page inert.
    const onResize = () => {
      if (button.getClientRects().length === 0) onHidden();
    };
    window.addEventListener("resize", onResize);

    return () => {
      window.removeEventListener("resize", onResize);
      document.removeEventListener("keydown", onKey);
      for (const element of changed) element.removeAttribute("inert");
    };
  }, [buttonRef, onHidden, open, panelId]);
}
