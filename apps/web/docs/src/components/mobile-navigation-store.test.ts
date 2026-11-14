import { beforeEach, describe, expect, it } from "vitest";
import { useMobileNavigationStore } from "@/components/mobile-navigation-store";

describe("mobile navigation store", () => {
  beforeEach(() => {
    useMobileNavigationStore.setState({ isOpen: false });
  });

  it("starts closed and opens and closes", () => {
    expect(useMobileNavigationStore.getState().isOpen).toBe(false);
    useMobileNavigationStore.getState().open();
    expect(useMobileNavigationStore.getState().isOpen).toBe(true);
    useMobileNavigationStore.getState().close();
    expect(useMobileNavigationStore.getState().isOpen).toBe(false);
  });

  it("toggles", () => {
    useMobileNavigationStore.getState().toggle();
    expect(useMobileNavigationStore.getState().isOpen).toBe(true);
    useMobileNavigationStore.getState().toggle();
    expect(useMobileNavigationStore.getState().isOpen).toBe(false);
  });
});
