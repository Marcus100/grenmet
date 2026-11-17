import { type RefObject, useEffect, useRef } from "react";

/**
 * Moves focus into a confirm step when it opens, and back to the control that
 * opened it when it closes, so a keyboard or screen-reader user is never lost.
 */
export function useConfirmFocus(
  open: boolean,
  inside: RefObject<HTMLElement | null>,
  back: RefObject<HTMLElement | null>
): void {
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open) {
      inside.current?.focus();
    } else if (wasOpen.current) {
      back.current?.focus();
    }
    wasOpen.current = open;
  }, [open, inside, back]);
}
