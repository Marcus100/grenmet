import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// jsdom lacks these; Base UI primitives and the sidebar touch them on mount.
class ResizeObserverStub {
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

globalThis.ResizeObserver ??=
  ResizeObserverStub as unknown as typeof ResizeObserver;

window.matchMedia ??= ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
})) as unknown as typeof window.matchMedia;

// cmdk scrolls the selected item into view.
Element.prototype.scrollIntoView ??= vi.fn();
